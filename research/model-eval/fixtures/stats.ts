// Deterministic helpers over the frozen macro fixture. Every number a test
// quotes or grades against is computed here from fixtures/v1/macro-us.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Obs = { date: string; value: number | null };
export type Series = { fredId: string; label: string; units: string; observations: Obs[] };
export type Macro = { retrievedAt: string; series: Record<string, Series> };

export const loadMacro = (): Macro => JSON.parse(readFileSync(join(import.meta.dirname, 'v1', 'macro-us.json'), 'utf8'));

export const at = (s: Series, date: string) => s.observations.find((o) => o.date === date)?.value ?? null;

export function shiftMonth(date: string, n: number) {
  const [y, m] = date.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export const months = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftMonth(d, 1)) out.push(d);
  return out;
};

/** 12-month % change; null when either end is missing (never filled). */
export function yoy(s: Series, date: string): number | null {
  const a = at(s, date);
  const b = at(s, shiftMonth(date, -12));
  return a === null || b === null ? null : (a / b - 1) * 100;
}

export function pearson(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Paired values over months where both exist. */
export function paired(dates: string[], fx: (d: string) => number | null, fy: (d: string) => number | null) {
  const x: number[] = [];
  const y: number[] = [];
  const used: string[] = [];
  for (const d of dates) {
    const a = fx(d);
    const b = fy(d);
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    x.push(a);
    y.push(b);
    used.push(d);
  }
  return { x, y, n: x.length, used };
}

export const pctChange = (s: Series) => (d: string) => {
  const a = at(s, d);
  const b = at(s, shiftMonth(d, -1));
  return a === null || b === null ? null : (a / b - 1) * 100;
};
export const diff = (s: Series) => (d: string) => {
  const a = at(s, d);
  const b = at(s, shiftMonth(d, -1));
  return a === null || b === null ? null : a - b;
};
export const level = (s: Series) => (d: string) => at(s, d);

export const r2 = (v: number) => Math.round(v * 100) / 100;
export const r1 = (v: number) => Math.round(v * 10) / 10;

/** Render a month × series table as plain text (null → "n/a (missing)"). */
export function table(m: Macro, keys: string[], from: string, to: string, extra: Record<string, { label: string; f: (d: string) => number | null; dp: number }> = {}) {
  const cols = [...keys.map((k) => ({ head: `${m.series[k].label} [${m.series[k].units}]`, f: level(m.series[k]), dp: -1 })), ...Object.values(extra).map((e) => ({ head: e.label, f: e.f, dp: e.dp }))];
  const lines = [`month | ${cols.map((c) => c.head).join(' | ')}`];
  for (const d of months(from, to)) lines.push(`${d} | ${cols.map((c) => { const v = c.f(d); return v === null ? 'n/a (missing)' : c.dp >= 0 ? v.toFixed(c.dp) : String(v); }).join(' | ')}`);
  return lines.join('\n');
}
