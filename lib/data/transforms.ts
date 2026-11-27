// Pure, dependency-free transforms over observation arrays. Every function
// treats `null` as "no observation" and never invents a substitute value.
import type { Observation, Point } from './types.ts';

export const nonNull = (obs: Observation[]): Point[] =>
  obs.filter((o): o is Point => o.value !== null);

/** Latest observation with a value. */
export function latest(obs: Observation[]): Point {
  for (let i = obs.length - 1; i >= 0; i--) {
    const o = obs[i];
    if (o.value !== null) return { date: o.date, value: o.value };
  }
  throw new Error('series has no observations');
}

/** Value on an exact date, or null if the date is absent or missing. */
export function valueOn(obs: Observation[], date: string): number | null {
  return obs.find((o) => o.date === date)?.value ?? null;
}

/** Last observation with a value on or before `date`. */
export function asOf(obs: Observation[], date: string): Point | null {
  let found: Point | null = null;
  for (const o of obs) {
    if (o.date > date) break;
    if (o.value !== null) found = { date: o.date, value: o.value };
  }
  return found;
}

export const between = (pts: Point[], from: string, to = '9999-12-31') =>
  pts.filter((p) => p.date >= from && p.date <= to);

export function extreme(pts: Point[], kind: 'max' | 'min'): Point {
  if (!pts.length) throw new Error('empty range');
  return pts.reduce((a, b) => ((kind === 'max' ? b.value > a.value : b.value < a.value) ? b : a));
}

/**
 * Most recent point strictly before `before` whose value is >= threshold
 * (used for "highest since …" statements).
 */
export function lastAtOrAbove(pts: Point[], threshold: number, before: string): Point | null {
  let found: Point | null = null;
  for (const p of pts) {
    if (p.date >= before) break;
    if (p.value >= threshold) found = p;
  }
  return found;
}

/**
 * Calendar-month averages of a daily series. Missing days are excluded from
 * the average; each output point is dated the first of its month.
 */
export function monthlyAverage(obs: Observation[], decimals = 2): Point[] {
  const buckets = new Map<string, number[]>();
  for (const o of obs) {
    if (o.value === null) continue;
    const key = o.date.slice(0, 7);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(o.value);
  }
  return [...buckets].map(([month, vals]) => ({
    date: `${month}-01`,
    value: round(vals.reduce((a, b) => a + b, 0) / vals.length, decimals),
  }));
}

/**
 * Year-over-year percent change of a monthly index series:
 *   100 × (index[t] / index[t − 12 months] − 1)
 * A month is omitted when either observation is missing — no interpolation.
 */
export function yoyPercent(obs: Observation[], decimals = 2): Point[] {
  const byDate = new Map(obs.map((o) => [o.date, o.value]));
  const out: Point[] = [];
  for (const o of obs) {
    if (o.value === null) continue;
    const prior = byDate.get(shiftMonths(o.date, -12));
    if (prior === null || prior === undefined) continue;
    out.push({ date: o.date, value: round(100 * (o.value / prior - 1), decimals) });
  }
  return out;
}

/**
 * Annualized percent change over `months` months of a monthly index series:
 *   100 × ((index[t] / index[t − months]) ^ (12 / months) − 1)
 */
export function annualizedPercent(obs: Observation[], months: number, decimals = 2): Point[] {
  const byDate = new Map(obs.map((o) => [o.date, o.value]));
  const out: Point[] = [];
  for (const o of obs) {
    if (o.value === null) continue;
    const prior = byDate.get(shiftMonths(o.date, -months));
    if (prior === null || prior === undefined) continue;
    out.push({ date: o.date, value: round(100 * ((o.value / prior) ** (12 / months) - 1), decimals) });
  }
  return out;
}

/** a − b on dates where both series have a value (e.g. breakeven = nominal − real). */
export function difference(a: Observation[], b: Observation[], decimals = 2): Point[] {
  const bMap = new Map(b.map((o) => [o.date, o.value]));
  const out: Point[] = [];
  for (const o of a) {
    const bv = bMap.get(o.date);
    if (o.value === null || bv === null || bv === undefined) continue;
    out.push({ date: o.date, value: round(o.value - bv, decimals) });
  }
  return out;
}

/** Dates on which a step series (e.g. policy rate) moved by at least `minMove`. */
export function stepChanges(obs: Observation[], minMove: number): { date: string; from: number; to: number }[] {
  const pts = nonNull(obs);
  const out: { date: string; from: number; to: number }[] = [];
  // A running anchor detects the move even if it is spread over a couple of days of
  // drift; the reported `from` is the actual last observation before the change.
  let anchor = pts[0]?.value;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (anchor === undefined) break;
    if (Math.abs(p.value - anchor) >= minMove) {
      out.push({ date: p.date, from: pts[i - 1].value, to: p.value });
      anchor = p.value;
    }
  }
  return out;
}

/** Keep every n-th point (plus the last) — used to thin long daily series for charts. */
export function thin(pts: Point[], every: number): Point[] {
  return pts.filter((_, i) => i % every === 0 || i === pts.length - 1);
}

export function shiftMonths(isoDate: string, months: number): string {
  const [y, m] = isoDate.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${isoDate.slice(8, 10)}`;
}

export const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
