// Read-only inspection of a generated draft (Phase 3D.1a acceptance): schema,
// production validation and publication checks, per-stage model/latency/tokens
// from the job metrics, and text scans (non-Latin script, chat-template tokens,
// quotation marks, bare numbers, price/rate-target language in the outlook).
// Changes nothing.
//   node scripts/studio/inspect-draft.ts <articleId> [--text]
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { checkPublication } from '../../lib/publishing/rules.ts';
import { findBareNumbers, stringLeaves } from '../../lib/studio/numbers.ts';
import { SeshatArticleV1 } from '../../lib/studio/schema.ts';
import { validateArticle } from '../../lib/studio/validate.ts';

const env = readEnv() as Record<string, string>;
const id = process.argv[2];
const showText = process.argv.includes('--text');
if (!id) throw new Error('usage: inspect-draft.ts <articleId> [--text]');
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: authErr } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
if (authErr) throw new Error(`editor sign-in failed: ${authErr.message}`);

const { data: row, error } = await db.from('articles').select('id, status, revision, is_temporary, content').eq('id', id).single();
if (error || !row) throw new Error(`read article: ${error?.message}`);
const parsed = SeshatArticleV1.safeParse(row.content);
console.log(`article ${row.id} · status ${row.status} · rev ${row.revision} · temporary ${row.is_temporary} · schema ${parsed.success ? 'valid' : 'INVALID'}`);
if (!parsed.success) {
  console.log(parsed.error.issues.slice(0, 10));
  process.exit(1);
}
const a = parsed.data;
const today = new Date().toISOString().slice(0, 10);
const v = validateArticle(a, { today });
const errors = v.issues.filter((i) => i.level === 'error');
const warnings = v.issues.filter((i) => i.level !== 'error');
console.log(`\nvalidation: ${errors.length} error(s), ${warnings.length} warning(s)`);
for (const i of v.issues) console.log(`  [${i.level}] ${i.path}: ${i.message} (${i.code})`);
const pub = checkPublication({ content: a, isTemporary: row.is_temporary, generating: false, today });
console.log(`\npublication check: ${pub.blocking.length} blocking, ${pub.warnings?.length ?? 0} warning(s)`);
for (const i of pub.blocking) console.log(`  [blocking] ${'path' in i ? i.path + ': ' : ''}${i.message}`);
for (const i of pub.warnings ?? []) console.log(`  [warning] ${'path' in i ? i.path + ': ' : ''}${i.message}`);

// Text scans over every prose string (data products excluded).
const prose = { title: a.meta.workingTitle, story: a.story, macro: a.macro, analytics: a.analytics, outlook: a.outlook };
const leaves = [...stringLeaves(prose)].map(([path, value]) => ({ path, value }));
const nonLatin = /[Ѐ-ӿ֐-ۿ぀-ヿ㐀-鿿가-힯]/;
const template = /<\|[a-z_]+\|?>|<\/?think>|\[\/?INST\]|<\/?s>/i;
const targets = /\b(target(?:ing|s)?|reach(?:es|ing)?|hit(?:s|ting)?|climb(?:s|ing)? to|fall(?:s|ing)? to|break(?:s|ing)? (?:above|below)|exceed(?:s|ing)?)\b[^.]{0,40}(\{[A-Za-z0-9]+\}|\d[\d,.]*\s*%?)/i;
let found = 0;
for (const l of leaves) {
  const t = l.value;
  const flags = [nonLatin.test(t) && 'NON-LATIN', template.test(t) && 'TEMPLATE-TOKEN'].filter(Boolean);
  if (flags.length) {
    found++;
    console.log(`  [${flags.join(',')}] ${l.path}: ${t.slice(0, 160)}`);
  }
}
console.log(`\nscript/template scan: ${found ? found + ' hit(s)' : 'clean'}`);
const quotes = leaves.filter((l) => /[“”"]/.test(l.value) || /\bsaid\b/.test(l.value));
console.log(`quotation candidates: ${quotes.length}`);
for (const q of quotes) console.log(`  ${q.path}: ${q.value.slice(0, 220)}`);
const bare = leaves.flatMap((l) => findBareNumbers(l.value).map((b) => ({ path: l.path, b })));
console.log(`bare numbers in prose: ${bare.length}`);
for (const x of bare) console.log(`  ${x.path}: ${JSON.stringify(x.b)}`);
const outlookTargets = leaves.filter((l) => l.path.startsWith('outlook')).filter((l) => targets.test(l.value));
console.log(`outlook target-language candidates (heuristic, read manually): ${outlookTargets.length}`);
for (const l of outlookTargets) console.log(`  ${l.path}: ${l.value.slice(0, 220)}`);

// Per-stage model, latency and tokens.
if (a.generation?.jobId) {
  const { data: job } = await db.from('generation_jobs').select('status, metrics, warnings, created_at, finished_at').eq('id', a.generation.jobId).single();
  if (job) {
    console.log(`\njob ${a.generation.jobId} · ${job.status} · generation.model = ${a.generation.model}`);
    let total = 0;
    for (const [stage, runs] of Object.entries((job.metrics?.stages ?? {}) as Record<string, { ms: number; llm?: Record<string, unknown>; requests?: unknown }[]>)) {
      for (const [i, r] of runs.entries()) {
        total += r.ms;
        const l = r.llm;
        console.log(`  ${stage.padEnd(16)} run ${i + 1}  ${(r.ms / 1000).toFixed(1).padStart(6)} s${l ? `  in ${l.promptTokens} out ${l.completionTokens} reasoning ${l.reasoningTokens ?? 0} finish ${l.finish ?? '-'} rounds ${l.attempts}  ${l.model ?? '(model not recorded)'}` : ''}${r.requests ? '  requests ' + JSON.stringify(r.requests) : ''}`);
      }
    }
    console.log(`  total stage time ${(total / 1000).toFixed(0)} s · job wall ${job.finished_at ? ((Date.parse(job.finished_at) - Date.parse(job.created_at)) / 1000).toFixed(0) + ' s' : '-'}`);
    console.log(`  job warnings: ${(job.warnings ?? []).length}`);
    for (const w of job.warnings ?? []) console.log(`    [${w.stage}] ${w.message}`);
  }
}
if (showText) {
  console.log('\n──── TEXT ────');
  for (const l of leaves) if (l.value.length > 40) console.log(`\n[${l.path}]\n${l.value}`);
}
await db.auth.signOut();
