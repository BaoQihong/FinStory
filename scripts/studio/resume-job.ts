// Retry a failed generation job and run it to completion — the same state
// change as the studio's "Retry" button (retryJob), followed by step calls.
// Completed stages are reused; only the failed stage onwards runs again.
// Usage: node scripts/studio/resume-job.ts <jobId>
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { arliLlm } from '../../lib/studio/llm.ts';
import { tavilyProvider } from '../../lib/studio/providers/tavily.ts';
import { fredProvider } from '../../lib/studio/providers/fred.ts';
import { tiingoProvider } from '../../lib/studio/providers/tiingo.ts';
import { eiaProvider } from '../../lib/studio/providers/eia.ts';
import { supabaseStore } from '../../lib/studio/supabase-store.ts';
import { runStep, summarizeMetrics } from '../../lib/studio/pipeline/runner.ts';

const env = readEnv() as Record<string, string>;
const jobId = process.argv[2];
if (!jobId) throw new Error('usage: resume-job.ts <jobId>');
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: authErr } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
if (authErr) throw new Error(`editor sign-in failed: ${authErr.message}`);

const { data: job } = await db.from('generation_jobs').select('status, stage, attempts, article_id').eq('id', jobId).single();
if (!job) throw new Error('job not found');
if (job.status === 'failed') {
  const attempts = { ...(job.attempts as Record<string, number>), [job.stage]: 0 };
  const { error } = await db.from('generation_jobs').update({ status: 'running', error: null, attempts, finished_at: null, lease_token: null, lease_expires_at: null }).eq('id', jobId).eq('status', 'failed');
  if (error) throw new Error(`retry: ${error.message}`);
  console.log(`retrying from stage "${job.stage}" (earlier stages reused)`);
}
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
for (let i = 0; i < 45; i++) {
  const r = await runStep(deps, jobId);
  if (r.kind === 'idle') break;
  if (r.kind === 'busy') {
    await new Promise((res) => setTimeout(res, 3000));
    continue;
  }
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.stage}${r.ok ? '' : '  ' + r.job.error?.message.slice(0, 200)}`);
}
const { data: fin } = await db.from('generation_jobs').select('*').eq('id', jobId).single();
const { data: art } = await db.from('articles').select('status, revision').eq('id', job.article_id).single();
const sum = summarizeMetrics(fin);
console.log(`job ${fin.status} · draft ${art?.status} rev ${art?.revision} · total tokens ${sum.promptTokens}+${sum.completionTokens}`);
for (const w of fin.warnings.slice(-3)) console.log(`  [${w.stage}] ${w.message}`);
await db.auth.signOut();
