// Prints the Markdown tables used in docs/research/phase-3d1-model-evaluation.md
// from records.jsonl (last write per key wins; later runs override earlier ones).
//   node research/model-eval/report-tables.ts > research/model-eval/results/report-tables.md
import { join } from 'node:path';
import { loadDone } from './lib/runner.ts';
import type { RecordRow } from './lib/types.ts';

const R = join(import.meta.dirname, 'results');
const load = (...runs: string[]) => {
  const m = new Map<string, RecordRow>();
  for (const run of runs) for (const [k, v] of loadDone(join(R, run))) m.set(k, v);
  return [...m.values()];
};
const med = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const sec = (ms: number | null) => (ms === null ? '–' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0));
const short = (m: string) => m.replace('Gemma-4-31B-Claude-4.6-Opus-Reasoning-Distilled', 'Gemma-4-31B-Distill').replace('-MOPD', '').replace('-1017', '');

// ── Qualification matrix ──
const qual = load('qual-2026-11-28', 'qual-2026-11-28-retry');
const cases = [...new Set(qual.map((r) => r.case))];
const models = [...new Set(qual.map((r) => r.config))];
const cell = (r: RecordRow | undefined) => {
  if (!r) return '·';
  if (!r.result.ok) return r.result.errorKind === 'http' ? `✗${r.result.httpStatus}` : `✗${r.result.errorKind}`;
  const f = r.checks.filter((c) => c.pass === false).length;
  return f ? `✗(${f})` : '✓';
};
console.log('## Qualification (✓ all checks pass · ✗(n) n checks failed · ✗NNN HTTP status)\n');
console.log(`| Case | ${models.map(short).join(' | ')} |`);
console.log(`|---|${models.map(() => '---').join('|')}|`);
for (const c of cases) console.log(`| ${c} | ${models.map((m) => cell(qual.find((r) => r.config === m && r.case === c))).join(' | ')} |`);

// ── Benchmark operations (A–E, all reps) and Test F ──
const bench = load('pilot-households', 'bench-households');
const f = load('f-households');
const ops = (rows: RecordRow[], title: string) => {
  console.log(`\n## ${title}\n`);
  console.log('| Config | n | ok | median latency s | max s | median in | median out | median reasoning | finish=length | median out tok/s |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const cfgs = [...new Set(rows.map((r) => r.config))];
  for (const c of cfgs) {
    const rs = rows.filter((r) => r.config === c);
    const ok = rs.filter((r) => r.result.ok);
    const lat = ok.map((r) => r.result.latencyMs);
    const tps = ok.map((r) => r.outputTokensPerSec ?? NaN);
    console.log(
      `| ${c} | ${rs.length} | ${ok.length} | ${sec(med(lat))} | ${sec(lat.length ? Math.max(...lat) : null)} | ${med(ok.map((r) => r.result.usage.input ?? NaN)) ?? '–'} | ${med(ok.map((r) => r.result.usage.output ?? NaN)) ?? '–'} | ${med(ok.map((r) => r.result.usage.reasoning ?? 0)) ?? '–'} | ${ok.filter((r) => r.result.finishReason === 'length').length} | ${med(tps) ?? '–'} |`,
    );
  }
};
ops(bench, 'Tests A–E operations (households fixture, all repetitions)');
ops(f, 'Test F operations (households-feel-poorer, 10 production stages)');

// ── Test A answer accuracy ──
console.log('\n## Test A — deterministic answers\n');
console.log('| Config | answers correct | out tokens | finish |');
console.log('|---|---|---|---|');
for (const r of bench.filter((x) => x.suite === 'A'))
  console.log(`| ${r.config} | ${r.checks.filter((c) => c.pass).length}/${r.checks.length} | ${r.result.usage.output ?? '–'} | ${r.result.finishReason ?? r.result.errorKind} |`);

// ── Test F by stage ──
const stages = [...new Set(f.map((r) => r.case))];
const fc = [...new Set(f.map((r) => r.config))];
console.log('\n## Test F — checks by stage (✓ all pass · ✗ ids that failed · →R after production repair round)\n');
console.log(`| Stage | ${fc.join(' | ')} |`);
console.log(`|---|${fc.map(() => '---').join('|')}|`);
for (const s of stages)
  console.log(
    `| ${s.replace('F-', '')} | ${fc
      .map((c) => {
        const r = f.find((x) => x.config === c && x.case === s);
        if (!r) return '·';
        if (!r.result.ok) return `✗${r.result.errorKind}`;
        const bad = r.checks.filter((x) => x.pass === false).map((x) => x.id.replace('no_bare_numbers', 'bare').replace('uses_fact_tokens', 'no-tokens').replace('json_parses_production', 'json').replace('finish_stop', 'len').replace('json_bare', 'fence'));
        const rep = r.repairRound ? `→R ${r.repairRound.checks.filter((x) => x.pass === false).length ? '✗' : '✓'}` : '';
        return (bad.length ? `✗ ${bad.join(',')}` : '✓') + (rep ? ` ${rep}` : '');
      })
      .join(' | ')} |`,
  );
