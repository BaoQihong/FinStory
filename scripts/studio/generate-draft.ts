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
import { roleLlm } from '../../lib/studio/llm.ts';
import { modelOverrides } from '../../lib/studio/model-roles.ts';
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
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const fromArticle = flag('--brief-from'); // copy an existing draft's full brief (read-only; that draft is not touched)
const file = args.find((a, i) => !a.startsWith('--') && !['--title', '--brief-from'].includes(args[i - 1]));
if (!file && !fromArticle) throw new Error('usage: generate-draft.ts <brief.txt> | --brief-from <articleId>  [--temporary] [--title "..."]');
const temporary = args.includes('--temporary');
const title = flag('--title');

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: true } });
const { error: authErr } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
if (authErr) throw new Error(`editor sign-in failed: ${authErr.message}`);
let source: Record<string, unknown> = {};
if (fromArticle) {
  const { data: src, error: sErr } = await db.from('articles').select('brief').eq('id', fromArticle).single();
  if (sErr || !src) throw new Error(`read brief of ${fromArticle}: ${sErr?.message}`);
  source = src.brief as Record<string, unknown>;
}
const brief = StoryBrief.parse({ ...source, ...(file ? { prompt: readFileSync(file, 'utf8').trim() } : {}), ...(title ? { headline: title } : {}) });

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
console.log(`models: ${roleLlm({ baseUrl: '', apiKey: '', env: { ...env, ...modelOverrides(process.env) } }).model}`);

const fp = (k?: string) => (k ? createHash('sha256').update(k).digest('hex').slice(0, 12) : 'not-configured');
const deps = {
  store: supabaseStore(db),
  // Model variables: the process environment overrides .env.local (as in Next.js), so a run can try a selection (D-058).
  llm: roleLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, env: { ...env, ...modelOverrides(process.env) } }),
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
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.stage.padEnd(16)} ${((m?.ms ?? 0) / 1000).toFixed(1).padStart(6)} s${m?.llm ? `  tokens ${m.llm.promptTokens}+${m.llm.completionTokens} reasoning ${m.llm.reasoningTokens ?? 0} finish ${m.llm.finish ?? '-'} rounds ${m.llm.attempts} · ${m.llm.model ?? deps.llm.model}` : ''}${m?.requests ? '  requests ' + JSON.stringify(m.requests) : ''}${r.ok ? '' : '  ' + r.job.error?.message.slice(0, 200)}`);
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
