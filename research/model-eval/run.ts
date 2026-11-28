// Phase 3D.1 benchmark CLI (research utility; separate from the application).
//
//   node research/model-eval/run.ts catalog
//   node research/model-eval/run.ts qual [--models Qwen3.8-27B,GLM-4.7]
//   node research/model-eval/run.ts bench --suites A,B --configs qwen27b,glm47 [--subject households]
//   node research/model-eval/run.ts concurrency
//
// Common options: --run <id> (resume into results/<id>; default: new id)
//   --timeout <ms> (default 300000) --retries <n> (default 1) --gap <ms> (default 750)
//   --token-scale <x> (multiplies every max_tokens) --retry-errors --dry-run --skip-preflight
//
// Requests run strictly one at a time. Credentials come from .env.local and are
// never printed or written; reports carry only a key fingerprint.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arliEnv, fingerprint } from './lib/env.ts';
import { chat, listModels } from './lib/arli.ts';
import { runCases } from './lib/runner.ts';
import { CONFIGS, qualConfigs, QUAL_MODELS } from './models.ts';
import { QUAL_CASES } from './suites/qual.ts';
import type { Case } from './lib/types.ts';

const HERE = import.meta.dirname;
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n: string, d?: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const flag = (n: string) => args.includes(`--${n}`);
const env = arliEnv();
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function preflight() {
  if (flag('skip-preflight')) return;
  // Production shares the single Arli request slot (D-010). Refuse to start while
  // a generation job or a polish/fix/brief reservation is in flight.
  const { createClient } = await import('@supabase/supabase-js');
  const { readEnv } = await import('../../scripts/lib/env-file.mjs');
  const e = readEnv() as Record<string, string>;
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: e.EDITOR_EMAIL, password: e.EDITOR_PASSWORD });
  if (error) throw new Error(`preflight sign-in failed (use --skip-preflight to bypass): ${error.message}`);
  const { data: jobs } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: res } = await db.from('api_usage').select('id').eq('service', 'arli').eq('calls', 0).gte('created_at', since).limit(1);
  if (jobs?.length || res?.length) throw new Error('production Arli work is in flight (generation job or reservation); try later');
  console.log('preflight: no production Arli work in flight');
}

const runId = opt('run') ?? `${stamp()}-${cmd}`;
const runDir = join(HERE, 'results', runId);
const common = {
  runDir,
  runId,
  baseUrl: env.baseUrl,
  apiKey: env.apiKey,
  timeoutMs: Number(opt('timeout', '300000')),
  retries: Number(opt('retries', '1')),
  gapMs: Number(opt('gap', '750')),
  tokenScale: Number(opt('token-scale', '1')),
  retryErrors: flag('retry-errors'),
  dryRun: flag('dry-run'),
};

function writeMeta(extra: Record<string, unknown>) {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, `meta-${stamp()}.json`),
    JSON.stringify({ runId, command: args.filter((a, i) => !(args[i - 1] === '--run')).join(' '), node: process.version, provider: 'arliai', host: new URL(env.baseUrl).host, keyFingerprint: fingerprint(env.apiKey), productionModel: env.productionModel, startedAt: new Date().toISOString(), options: { ...common, apiKey: undefined, baseUrl: undefined }, ...extra }, null, 1),
  );
}

if (cmd === 'catalog') {
  const r = await listModels(env.baseUrl, env.apiKey);
  const dir = join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `catalog-${stamp()}.json`);
  const wanted = QUAL_MODELS.map((m) => m.model);
  const ids = new Set(r.models.map((m) => String(m.id)));
  writeFileSync(file, JSON.stringify({ retrievedAt: new Date().toISOString(), host: new URL(env.baseUrl).host, status: r.status, count: r.models.length, shortlistPresent: Object.fromEntries(wanted.map((w) => [w, ids.has(w)])), models: r.models }, null, 1));
  console.log(`catalog: ${r.models.length} models → ${file}`);
  for (const w of wanted) console.log(`  ${ids.has(w) ? '✓' : '✗'} ${w}`);
} else if (cmd === 'qual') {
  await preflight();
  const only = opt('models')?.split(',');
  const configs = qualConfigs().filter((c) => !only || only.includes(c.model));
  const cases = QUAL_CASES.filter((c) => !opt('cases') || opt('cases')!.split(',').includes(c.id));
  writeMeta({ suite: 'qual', configs: configs.map((c) => c.id), cases: cases.map((c) => c.id) });
  await runCases(configs, cases, common);
  // One invalid model id (error-format probe) — once per run, not per model.
  if (!only && !common.dryRun) {
    const r = await chat(env.baseUrl, env.apiKey, { model: 'Seshat-Nonexistent-Model-Probe', messages: [{ role: 'user', content: 'hi' }], params: { max_tokens: 5 }, stream: false, timeoutMs: 30000 });
    writeFileSync(join(runDir, 'invalid-model-probe.json'), JSON.stringify({ httpStatus: r.httpStatus, errorKind: r.errorKind, errorDetail: r.errorDetail, ok: r.ok, echoedModel: r.echoedModel, content: r.content.slice(0, 200) }, null, 1));
    console.log(`invalid-model probe: ${r.httpStatus} ${r.errorKind} ${r.errorDetail?.slice(0, 200)}`);
  }
} else if (cmd === 'concurrency') {
  // Two tiny requests in parallel against the baseline model, once: does Arli
  // queue, reject (429) or serve both? Run only when production is idle.
  await preflight();
  mkdirSync(runDir, { recursive: true });
  const spec = (i: number) => ({ model: env.productionModel, messages: [{ role: 'user' as const, content: `Write one sentence about the number ${i}.` }], params: { max_tokens: 120, temperature: 0, chat_template_kwargs: { enable_thinking: false } }, stream: true, timeoutMs: 120000 });
  const t0 = Date.now();
  const rs = await Promise.all([1, 2, 3].map((i) => chat(env.baseUrl, env.apiKey, spec(i))));
  const out = rs.map((r, i) => ({ i: i + 1, ok: r.ok, httpStatus: r.httpStatus, errorKind: r.errorKind, errorDetail: r.errorDetail?.slice(0, 400), latencyMs: r.latencyMs, ttftMs: r.ttftMs, startOffsetMs: Date.parse(r.startedAt) - t0, endOffsetMs: Date.parse(r.completedAt) - t0, headers: r.headers, out: r.usage.output }));
  writeFileSync(join(runDir, 'concurrency.json'), JSON.stringify({ at: new Date().toISOString(), model: env.productionModel, parallel: 3, results: out }, null, 1));
  console.log(JSON.stringify(out, null, 1));
} else if (cmd === 'bench') {
  await preflight();
  const suites = (opt('suites') ?? 'A,B,C,D,E,F').split(',');
  const only = opt('configs')?.split(',');
  const configs = CONFIGS.filter((c) => !only || only.includes(c.id));
  const { loadSuite } = await import('./suites/index.ts');
  const cases: Case[] = [];
  for (const s of suites) cases.push(...(await loadSuite(s, { subject: opt('subject'), cases: opt('cases')?.split(','), reps: opt('reps') ? Number(opt('reps')) : undefined })));
  writeMeta({ suites, configs: configs.map((c) => c.id), cases: cases.map((c) => `${c.suite}/${c.id}`) });
  await runCases(configs, cases, common);
} else {
  console.log('commands: catalog | qual | concurrency | bench (see header of run.ts)');
  process.exit(1);
}
