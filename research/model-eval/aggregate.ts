// Aggregate benchmark records into per-config / per-category statistics.
// Every aggregate carries its observation count (n); nothing is extrapolated.
//
//   node research/model-eval/aggregate.ts <runId> [<runId> …] [--out results/summary-x]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDone } from './lib/runner.ts';
import type { RecordRow } from './lib/types.ts';

const HERE = import.meta.dirname;
const args = process.argv.slice(2);
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const runs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const rows: RecordRow[] = runs.flatMap((r) => [...loadDone(join(HERE, 'results', r)).values()]);

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
const rnd = (v: number | null, d = 0) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

function stats(rs: RecordRow[]) {
  const ok = rs.filter((r) => r.result.ok);
  const lat = nums(ok.map((r) => r.result.latencyMs));
  const ttft = nums(ok.map((r) => r.result.ttftMs));
  const tps = nums(ok.map((r) => r.outputTokensPerSec));
  const checks = ok.flatMap((r) => r.checks.filter((c) => c.pass !== null && (c.weight ?? 1) > 0));
  const byCheck = (id: string) => {
    const xs = ok.flatMap((r) => r.checks.filter((c) => c.id === id && c.pass !== null));
    return xs.length ? { pass: xs.filter((c) => c.pass).length, n: xs.length } : null;
  };
  const afterRepair = ok
    .filter((r) => r.checks.some((c) => c.id === 'schema_valid' || c.id === 'json_parses_production'))
    .map((r) => {
      const first = r.checks.find((c) => c.id === 'schema_valid')?.pass === true;
      const second = r.repairRound?.checks.find((c) => c.id === 'schema_valid')?.pass === true;
      return first || second;
    });
  return {
    requests: rs.length,
    succeeded: ok.length,
    failed: rs.length - ok.length,
    errors: [...new Set(rs.filter((r) => !r.result.ok).map((r) => `${r.result.errorKind} ${r.result.httpStatus ?? ''}`.trim()))],
    retries: rs.reduce((a, r) => a + r.retries, 0),
    latencyMs: { n: lat.length, mean: rnd(mean(lat)), median: rnd(median(lat)), min: lat.length ? Math.min(...lat) : null, max: lat.length ? Math.max(...lat) : null },
    ttftMs: { n: ttft.length, median: rnd(median(ttft)), min: ttft.length ? Math.min(...ttft) : null, max: ttft.length ? Math.max(...ttft) : null },
    tokens: {
      inputMean: rnd(mean(nums(ok.map((r) => r.result.usage.input)))),
      outputMean: rnd(mean(nums(ok.map((r) => r.result.usage.output)))),
      reasoningMean: rnd(mean(nums(ok.map((r) => r.result.usage.reasoning)))),
      reasoningReported: ok.filter((r) => r.result.usage.reasoning !== null).length,
      inputTotal: nums(ok.map((r) => r.result.usage.input)).reduce((a, b) => a + b, 0),
      outputTotal: nums(ok.map((r) => r.result.usage.output)).reduce((a, b) => a + b, 0),
    },
    outputTokensPerSec: { n: tps.length, median: rnd(median(tps), 1), min: tps.length ? Math.min(...tps) : null, max: tps.length ? Math.max(...tps) : null },
    finishReasons: Object.fromEntries([...new Set(ok.map((r) => String(r.result.finishReason)))].map((f) => [f, ok.filter((r) => String(r.result.finishReason) === f).length])),
    checksPassed: { pass: checks.filter((c) => c.pass).length, n: checks.length },
    json: { bare: byCheck('json_bare'), parses: byCheck('json_parses_production') ?? byCheck('json_parses'), schemaFirstAttempt: byCheck('schema_valid'), schemaAfterProductionRepair: afterRepair.length ? { pass: afterRepair.filter(Boolean).length, n: afterRepair.length } : null },
    substitutionSuspected: rs.filter((r) => r.substitution === true).length,
    reasoningFields: [...new Set(ok.map((r) => r.result.reasoningField).filter(Boolean))],
  };
}

const configs = [...new Set(rows.map((r) => r.config))];
const suites = [...new Set(rows.map((r) => r.suite))];
const summary = {
  runs,
  generatedAt: new Date().toISOString(),
  records: rows.length,
  note: 'n = number of observations behind each aggregate. Latency is end-to-end wall time from this machine; output tokens/s = output tokens ÷ (latency − time to first token), streaming requests only. Arli is a flat-rate subscription: no per-token cost applies.',
  byConfig: Object.fromEntries(configs.map((c) => [c, { model: rows.find((r) => r.config === c)!.model, mode: rows.find((r) => r.config === c)!.mode, all: stats(rows.filter((r) => r.config === c)), bySuite: Object.fromEntries(suites.map((s) => [s, stats(rows.filter((r) => r.config === c && r.suite === s))]).filter(([, v]) => (v as { requests: number }).requests)) }])),
  byCase: Object.fromEntries(
    [...new Set(rows.map((r) => `${r.suite}/${r.case}`))].map((k) => [
      k,
      Object.fromEntries(
        configs
          .map((c) => [c, rows.filter((r) => r.config === c && `${r.suite}/${r.case}` === k)] as const)
          .filter(([, rs]) => rs.length)
          .map(([c, rs]) => [c, rs.map((r) => ({ ok: r.result.ok, ms: r.result.latencyMs, ttft: r.result.ttftMs, in: r.result.usage.input, out: r.result.usage.output, reasoning: r.result.usage.reasoning, tps: r.outputTokensPerSec, finish: r.result.finishReason, error: r.result.ok ? undefined : `${r.result.errorKind} ${r.result.httpStatus ?? ''} ${(r.result.errorDetail ?? '').slice(0, 200)}`, checks: Object.fromEntries(r.checks.map((x) => [x.id, x.pass])), checkDetails: Object.fromEntries(r.checks.filter((x) => x.pass === false || x.id === 'signals').map((x) => [x.id, x.detail])), repair: r.repairRound ? Object.fromEntries(r.repairRound.checks.map((x) => [x.id, x.pass])) : undefined, fallback: r.fallbackUsed ?? undefined }))]),
      ),
    ]),
  ),
};
const out = outArg ?? join(HERE, 'results', `summary-${runs.join('+')}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));

// Flat CSV, one row per request (for spreadsheets).
const csvCols = ['config', 'model', 'mode', 'suite', 'case', 'rep', 'ok', 'httpStatus', 'errorKind', 'latencyMs', 'ttftMs', 'inputTokens', 'outputTokens', 'reasoningTokens', 'outputTokensPerSec', 'finishReason', 'checksPassed', 'checksTotal', 'retries'];
const esc = (v: unknown) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const lines = [csvCols.join(',')];
for (const r of rows) {
  const scored = r.checks.filter((c) => c.pass !== null && (c.weight ?? 1) > 0);
  lines.push([r.config, r.model, r.mode, r.suite, r.case, r.rep, r.result.ok, r.result.httpStatus, r.result.errorKind, r.result.latencyMs, r.result.ttftMs, r.result.usage.input, r.result.usage.output, r.result.usage.reasoning, r.outputTokensPerSec, r.result.finishReason, scored.filter((c) => c.pass).length, scored.length, r.retries].map(esc).join(','));
}
writeFileSync(join(out, 'requests.csv'), lines.join('\n'));
console.log(`${rows.length} records → ${out}`);
for (const c of configs) {
  const s = summary.byConfig[c].all;
  console.log(`${c.padEnd(28)} n=${s.requests} ok=${s.succeeded} p50=${s.latencyMs.median}ms ttft50=${s.ttftMs.median} tps50=${s.outputTokensPerSec.median} checks ${s.checksPassed.pass}/${s.checksPassed.n}`);
}
