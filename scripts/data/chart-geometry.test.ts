// Unit tests for lib/data/chart-geometry. Run: node --test scripts/data/chart-geometry.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapThreshold, layoutLabels, segmentRuns, wrapLabel } from '../../lib/data/chart-geometry.ts';

const DAY = 86_400_000;
const ts = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Business days (Mon–Fri) from `start`, `n` of them, skipping the given ISO holidays. */
function businessDays(start: string, n: number, holidays: string[] = []): number[] {
  const out: number[] = [];
  for (let t = ts(start); out.length < n; t += DAY) {
    const d = new Date(t).getUTCDay();
    if (d === 0 || d === 6 || holidays.includes(new Date(t).toISOString().slice(0, 10))) continue;
    out.push(t);
  }
  return out;
}
const calendarDays = (start: string, n: number) => Array.from({ length: n }, (_, i) => ts(start) + i * DAY);
const everyNth = (xs: number[], n: number) => xs.filter((_, i) => i % n === 0 || i === xs.length - 1);
const monthly = (y: number, m: number, n: number) => Array.from({ length: n }, (_, i) => Date.UTC(y, m - 1 + i, 1));

test('business-day series: weekends and holidays stay one continuous run', () => {
  const t = businessDays('2025-12-01', 60, ['2025-12-25', '2026-01-01', '2026-01-19']);
  assert.deepEqual(segmentRuns(t), [[0, t.length - 1]]);
});

test('weak-dollar regression: DGS10-style and DFF-style series thinned every 5th both stay continuous', () => {
  // DGS10: business days, every 5th observation ≈ weekly. DFF: every calendar day, every 5th ≈ 5 days.
  // Their dates rarely coincide — neither may treat the other's dates as missing observations.
  const dgs10 = everyNth(businessDays('2017-01-03', 2500, ['2017-07-04', '2017-12-25', '2018-01-01']), 5);
  const dff = everyNth(calendarDays('2017-01-01', 3600), 5);
  assert.equal(segmentRuns(dgs10).length, 1);
  assert.equal(segmentRuns(dff).length, 1);
  const shared = new Set(dgs10).size + new Set(dff).size - new Set([...dgs10, ...dff]).size;
  assert.ok(shared < dgs10.length / 3, 'the two calendars mostly differ (the original failure)');
});

test('a genuine multi-week gap in a daily series breaks the line', () => {
  const t = [...businessDays('2025-01-02', 40), ...businessDays('2025-04-01', 40)];
  const runs = segmentRuns(t);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], [0, 39]);
});

test('daily series: the documented bridging limit (≈ 6 calendar days) — a long weekend joins, a missing week breaks', () => {
  const base = businessDays('2026-01-05', 20);
  const longWeekend = [...base.slice(0, 10), ...base.slice(11)]; // one weekday missing next to a weekend → 4-day step
  assert.equal(segmentRuns(longWeekend).length, 1);
  const missingWeek = [...base.slice(0, 5), ...base.slice(10)]; // Fri → Mon a week later: 10-day step
  assert.equal(segmentRuns(missingWeek).length, 2);
});

test('a missing month in a monthly series stays a visible gap (core CPI, October 2025)', () => {
  const t = monthly(2024, 1, 30).filter((x) => x !== Date.UTC(2025, 9, 1));
  const runs = segmentRuns(t);
  assert.equal(runs.length, 2);
  assert.equal(new Date(t[runs[0][1]]).toISOString().slice(0, 7), '2025-09');
  assert.equal(new Date(t[runs[1][0]]).toISOString().slice(0, 7), '2025-11');
});

test('monthly series with short February and quarterly series are continuous', () => {
  assert.equal(segmentRuns(monthly(2020, 1, 72)).length, 1);
  assert.equal(segmentRuns(Array.from({ length: 24 }, (_, i) => Date.UTC(2020, i * 3, 1))).length, 1);
});

test('a lone observation between two gaps is its own one-point run', () => {
  const t = [...monthly(2024, 1, 6), Date.UTC(2024, 9, 1), ...monthly(2025, 3, 6)];
  assert.deepEqual(segmentRuns(t), [
    [0, 5],
    [6, 6],
    [7, 12],
  ]);
});

test('degenerate inputs', () => {
  assert.deepEqual(segmentRuns([]), []);
  assert.deepEqual(segmentRuns([ts('2026-01-01')]), [[0, 0]]);
  assert.equal(gapThreshold([ts('2026-01-01')]), Infinity);
  assert.ok(gapThreshold(businessDays('2026-01-05', 30)) >= 4 * DAY, 'a long weekend is never a gap');
});

test('wrapLabel keeps words whole and respects the column', () => {
  const lines = wrapLabel('US 10-year real (inflation-indexed) Treasury yield (%)', 19);
  assert.deepEqual(lines, ['US 10-year real', '(inflation-indexed)', 'Treasury yield (%)']);
  for (const l of lines) assert.ok(l.length <= 19);
  assert.deepEqual(wrapLabel('Federal funds effective rate (%)', 24), ['Federal funds effective', 'rate (%)']);
  assert.deepEqual(wrapLabel('Supercalifragilisticexpialidocious', 10), ['Supercalifragilisticexpialidocious']);
});

test('layoutLabels: separated labels stay centred on their line ends', () => {
  const tops = layoutLabels([{ y: 50, height: 14 }, { y: 150, height: 28 }], 0, 300);
  assert.deepEqual(tops, [43, 136]);
});

test('layoutLabels: colliding labels are stacked in value order without overlap', () => {
  // Three lines ending near the same level (nominal 4.1%, fed funds 3.9%, real 1.9% → close pixels).
  const items = [
    { y: 120, height: 28 },
    { y: 126, height: 28 },
    { y: 118, height: 42 },
  ];
  const tops = layoutLabels(items, 0, 300, 4);
  const blocks = items.map((it, i) => [tops[i], tops[i] + it.height]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < blocks.length; i++) assert.ok(blocks[i][0] >= blocks[i - 1][1] + 4 - 1e-9, 'no overlap');
  // Vertical order follows the line ends.
  assert.ok(tops[2] < tops[0] && tops[0] < tops[1]);
});

test('layoutLabels: labels near the bottom edge are pushed up inside the plot', () => {
  const tops = layoutLabels([{ y: 295, height: 28 }, { y: 298, height: 28 }], 0, 300, 4);
  assert.ok(tops[1] + 28 <= 300);
  assert.ok(tops[0] + 28 + 4 <= tops[1] + 1e-9);
});
