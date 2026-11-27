// Unit tests for lib/data/transforms. Run: node --test scripts/data/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualizedPercent,
  difference,
  lastAtOrAbove,
  monthlyAverage,
  shiftMonths,
  stepChanges,
  yoyPercent,
} from '../../lib/data/transforms.ts';

const monthly = (start: number, values: (number | null)[]) =>
  values.map((value, i) => ({ date: shiftMonths(`${start}-01-01`, i), value }));

test('shiftMonths crosses year boundaries', () => {
  assert.equal(shiftMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(shiftMonths('2025-10-01', 12), '2026-10-01');
  assert.equal(shiftMonths('2026-03-15', -14), '2025-01-15');
});

test('yoyPercent computes from index levels, not raw values', () => {
  const idx = monthly(2024, [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 103, 104]);
  const yoy = yoyPercent(idx);
  assert.deepEqual(yoy, [
    { date: '2025-01-01', value: 3 },
    { date: '2025-02-01', value: 2.97 },
  ]);
});

test('yoyPercent omits months whose year-earlier value is missing (no interpolation)', () => {
  const vals: (number | null)[] = Array.from({ length: 24 }, (_, i) => 100 + i);
  vals[9] = null; // October of year one missing
  const yoy = yoyPercent(monthly(2024, vals));
  const dates = yoy.map((p) => p.date);
  assert.ok(!dates.includes('2025-10-01'), 'Oct of year two must be omitted');
  assert.ok(dates.includes('2025-09-01') && dates.includes('2025-11-01'));
  assert.equal(yoy.length, 11);
});

test('annualizedPercent over 3 months', () => {
  const idx = monthly(2026, [100, 100.5, 101, 101.5]);
  const [p] = annualizedPercent(idx, 3);
  assert.equal(p.date, '2026-04-01');
  assert.equal(p.value, Math.round(100 * (1.015 ** 4 - 1) * 100) / 100);
});

test('monthlyAverage skips nulls', () => {
  const avg = monthlyAverage([
    { date: '2026-01-02', value: 4 },
    { date: '2026-01-03', value: null },
    { date: '2026-01-05', value: 5 },
    { date: '2026-02-02', value: 3 },
  ]);
  assert.deepEqual(avg, [
    { date: '2026-01-01', value: 4.5 },
    { date: '2026-02-01', value: 3 },
  ]);
});

test('difference aligns on dates and skips gaps', () => {
  const a = [
    { date: '2026-01-02', value: 4.5 },
    { date: '2026-01-03', value: null },
    { date: '2026-01-04', value: 4.6 },
  ];
  const b = [
    { date: '2026-01-02', value: 2 },
    { date: '2026-01-03', value: 2.1 },
  ];
  assert.deepEqual(difference(a, b), [{ date: '2026-01-02', value: 2.5 }]);
});

test('lastAtOrAbove finds the most recent earlier match', () => {
  const pts = [
    { date: '2002-05-14', value: 5.32 },
    { date: '2007-06-12', value: 5.26 },
    { date: '2026-10-05', value: 5.31 },
  ];
  assert.deepEqual(lastAtOrAbove(pts, 5.31, '2026-01-01'), { date: '2002-05-14', value: 5.32 });
  assert.equal(lastAtOrAbove(pts, 6, '2026-01-01'), null);
});

test('stepChanges ignores daily drift but catches policy moves', () => {
  const obs = [
    { date: 'a', value: 3.64 },
    { date: 'b', value: 3.63 },
    { date: 'c', value: 3.62 },
    { date: 'd', value: 3.88 },
    { date: 'e', value: 3.87 },
  ];
  // `from` is the observation immediately before the move, not the drifted anchor
  assert.deepEqual(stepChanges(obs, 0.2), [{ date: 'd', from: 3.62, to: 3.88 }]);
});
