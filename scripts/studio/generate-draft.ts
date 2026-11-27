// Generate a real, Supabase-persisted draft from a brief file, running the
// same pipeline as the studio under the EDITOR's session (RLS enforced) with
// the real providers. The draft appears in /admin like any studio draft.
//
// Usage:
//   node scripts/studio/generate-draft.ts <brief.txt> [--temporary] [--title "Working title"]
// The brief file holds the story prompt (plain text). Credentials come from
// .env.local (EDITOR_EMAIL / EDITOR_PASSWORD + provider keys); nothing secret is printed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { arliLlm } from '../../lib/studio/llm.ts';
import { tavilyProvider } from '../../lib/studio/providers/tavily.ts';
import { fredProvider } from '../../lib/studio/providers/fred.ts';
import { tiingoProvider } from '../../lib/studio/providers/tiingo.ts';
import { eiaProvider } from '../../lib/studio/providers/eia.ts';
import { supabaseStore } from '../../lib/studio/supabase-store.ts';
import { runStep, summarizeMetrics } from '../../lib/studio/pipeline/runner.ts';
import { StoryBrief } from '../../lib/studio/schema.ts';

const SITE = 'https://financialstoryteller.vercel.app';
const env = readEnv() as Record<string, string>;
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('usage: generate-draft.ts <brief.txt> [--temporary] [--title "..."]');
const temporary = args.includes('--temporary');
const titleIdx = args.indexOf('--title');
const title = titleIdx >= 0 ? args[titleIdx + 1] : undefined;
const brief = StoryBrief.parse({ prompt: readFileSync(file, 'utf8').trim(), ...(title ? { headline: title } : {}) });

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
const { error: authErr } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
if (authErr) throw new Error(`editor sign-in failed: ${authErr.message}`);

const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
if (active?.length) throw new Error(`another job is active (${active[0].id}); only one runs at a time`);
const { data: art, error: aErr } = await db
  .from('articles')
  .insert({ working_title: (title ?? brief.prompt).slice(0, 120), brief, status: 'generating', is_temporary: temporary })
  .select('id')
  .single();
if (aErr || !art) throw new Error(`create article: ${aErr?.message}`);
const { data: job, error: jErr } = await db.from('generation_jobs').insert({ article_id: art.id }).select('id').single();
if (jErr || !job) throw new Error(`create job: ${jErr?.message}`);
console.log(`draft ${art.id}${temporary ? ' (temporary)' : ''} · job ${job.id}`);

const fp = (k?: string) => (k ? createHash('sha256').update(k).digest('hex').slice(0, 12) : 'not-configured');
const deps = {
  store: supabaseStore(db),
  llm: arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model: env.ARLI_MODEL }),
  search: tavilyProvider(env.TAVILY_API_KEY),
  data: [fredProvider(env.FRED_API_KEY), tiingoProvider(env.TIINGO_API_KEY), eiaProvider(env.EIA_API_KEY)],
  keyFingerprints: { arli: fp(env.ARLI_API_KEY), tavily: fp(env.TAVILY_API_KEY), fred: fp(env.FRED_API_KEY), tiingo: fp(env.TIINGO_API_KEY), eia: fp(env.EIA_API_KEY) },
  today: () => new Date().toISOString().slice(0, 10),
  now: () => new Date(),
};

const t0 = Date.now();
for (let i = 0; i < 45; i++) {
  const r = await runStep(deps, job.id);
  if (r.kind === 'idle') break;
  if (r.kind === 'busy') {
    await new Promise((res) => setTimeout(res, 3000));
    continue;
  }
  const m = r.job.metrics.stages?.[r.stage]?.at(-1);
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.stage.padEnd(16)} ${((m?.ms ?? 0) / 1000).toFixed(1).padStart(6)} s${m?.llm ? `  tokens ${m.llm.promptTokens}+${m.llm.completionTokens}` : ''}${r.ok ? '' : '  ' + r.job.error?.message.slice(0, 200)}`);
}
const { data: fin } = await db.from('generation_jobs').select('*').eq('id', job.id).single();
const { data: a2 } = await db.from('articles').select('status, revision').eq('id', art.id).single();
const sum = summarizeMetrics(fin);
console.log(`\njob ${fin.status} · draft ${a2?.status} rev ${a2?.revision} · wall ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`usage: arli ${sum.promptTokens}+${sum.completionTokens} tokens in ${sum.llmCalls} calls · tavily ${sum.searchCredits} credits · data calls ${JSON.stringify(sum.calls)}`);
console.log(`warnings: ${fin.warnings.length}`);
for (const w of fin.warnings) console.log(`  [${w.stage}] ${w.message}`);
console.log(`\nEDIT    ${SITE}/admin/drafts/${art.id}\nPREVIEW ${SITE}/admin/drafts/${art.id}/preview`);
await db.auth.signOut();
