// Validate data fixtures and every number the Bond Comeback article displays.
//
// Usage (from repo root):  node scripts/data/validate-fixtures.ts
// (Node ≥22.18 strips TypeScript types natively — no build step.)
//
// Checks:
//   1. Fixture integrity — metadata present, dates ascending & unique, values finite or null.
//   2. Independent recomputation of headline facts straight from raw observations
//      (deliberately NOT using lib/data/transforms) and comparison with the builder.
//   3. Every fact token in the article resolves; no hardcoded percentages in copy.
//   4. Every chart / indicator the article references exists in the data module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeriesFixture } from '../../lib/data/types.ts';
import { buildBondComeback, REQUIRED_SERIES, type Fixtures } from '../../lib/stories/bond-comeback/build.ts';
import { listTokens, resolveTokens } from '../../lib/content/tokens.ts';
import { theBondComeback } from '../../content/articles/the-bond-comeback.ts';

const root = join(import.meta.dirname, '..', '..');
let failures = 0;
let checks = 0;
const ok = (cond: boolean, msg: string) => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FAIL  ${msg}`);
  }
};
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= tol;

// ── 1. Fixture integrity ─────────────────────────────────────────────
const fx = {} as Fixtures;
for (const id of REQUIRED_SERIES) {
  const f = JSON.parse(readFileSync(join(root, 'data', 'fred', `${id}.json`), 'utf8')) as SeriesFixture;
  fx[id] = f;
  ok(f.seriesId === id, `${id}: seriesId matches file name`);
  for (const k of ['name', 'units', 'frequency', 'retrievedAt'] as const) ok(Boolean(f[k]), `${id}: has ${k}`);
  ok(f.source.seriesUrl === `https://fred.stlouisfed.org/series/${id}`, `${id}: source URL`);
  ok(/^[0-9a-f]{64}$/.test(f.source.downloadSha256), `${id}: download hash recorded`);
  const obs = f.observations;
  ok(obs.length > 0, `${id}: has observations`);
  ok(obs[0].date === f.window.start && obs[obs.length - 1].date === f.window.end, `${id}: window matches observations`);
  let sorted = true;
  for (let i = 1; i < obs.length; i++) if (!(obs[i].date > obs[i - 1].date)) sorted = false;
  ok(sorted, `${id}: dates strictly ascending (no duplicates)`);
  ok(obs.every((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date)), `${id}: ISO dates`);
  ok(obs.every((o) => o.value === null || Number.isFinite(o.value)), `${id}: values finite or null`);
  const vals = obs.filter((o) => o.value !== null).map((o) => o.value as number);
  if (f.units === 'Percent') ok(vals.every((v) => v > -5 && v < 25), `${id}: plausible percent range`);
}

// ── 2. Independent recomputation ─────────────────────────────────────
const data = buildBondComeback(fx);
const F = data.facts;
const raw = (id: keyof Fixtures, date: string) => fx[id].observations.find((o) => o.date === date)?.value ?? null;

// 10-year: 2026 low/high by brute force.
const dgs26 = fx.DGS10.observations.filter((o) => o.date >= '2026-01-01' && o.value !== null) as { date: string; value: number }[];
const max26 = Math.max(...dgs26.map((o) => o.value));
const min26 = Math.min(...dgs26.map((o) => o.value));
ok(F.y10Peak.value === max26 && raw('DGS10', F.y10Peak.date!) === max26, `10y 2026 high = ${max26}`);
ok(F.y10Low.value === min26 && raw('DGS10', F.y10Low.date!) === min26, `10y 2026 low = ${min26}`);
ok(near(F.y10Rise.value, max26 - min26), '10y rise = high − low');

// "Highest since": nothing at/above the peak between that date and 2026.
const since = data.dates.y10PeakPrevSince.date;
ok(raw('DGS10', since)! >= max26, `10y at ${since} ≥ 2026 high`);
ok(
  fx.DGS10.observations.every((o) => o.date <= since || o.date >= '2026-01-01' || o.value === null || o.value < max26),
  '10y: no close ≥ 2026 high between "since" date and 2026',
);
const realSince = data.dates.realPeakPrevSince.date;
ok(
  fx.DFII10.observations.every((o) => o.date <= realSince || o.date >= '2026-01-01' || o.value === null || o.value < F.realPeak.value),
  'real yield: no close ≥ 2026 high between "since" date and 2026',
);

// Real yield & breakeven decomposition — identity must hold on each date.
for (const [nKey, rKey, bKey] of [
  ['y10Low', 'realAtLow', 'beAtLow'],
  ['y10Peak', 'realAtPeak', 'beAtPeak'],
  ['y10Latest', 'realLatest', 'beLatest'],
] as const) {
  const date = F[nKey].date!;
  ok(raw('DFII10', date) === F[rKey].value, `real yield on ${date} matches raw`);
  ok(near(F[bKey].value, F[nKey].value - F[rKey].value), `breakeven on ${date} = nominal − real`);
}
ok(near(F.realRise.value + F.beChange.value, F.y10Rise.value), 'real rise + breakeven change = nominal rise');
for (const s of data.split) ok(near(s.real + s.breakeven, s.nominal), `split ${s.label} sums to nominal`);

// Core CPI YoY: recompute from index levels.
const cpi = fx.CPILFESL.observations;
const idx = (d: string) => cpi.find((o) => o.date === d)?.value ?? null;
const ym = F.coreYoyLatest.date!;
const prior = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;
ok(near(F.coreYoyLatest.value, 100 * (idx(ym)! / idx(prior)! - 1)), `core YoY ${ym} recomputed from index`);
const last = cpi[cpi.length - 1];
const lastPrior = `${Number(last.date.slice(0, 4)) - 1}${last.date.slice(4)}`;
if (idx(lastPrior) === null) {
  ok(F.coreYoyLatest.date! < last.date, `core YoY not computed for ${last.date} (year-earlier index missing)`);
}
const threeBack = cpi[cpi.length - 4];
ok(near(F.core3m.value, 100 * ((last.value! / threeBack.value!) ** 4 - 1), 0.05), 'core 3m annualized recomputed');
ok(data.cpiMissing.every((d) => idx(d) === null), 'reported missing CPI months are null in fixture');

// Policy & growth.
ok(F.ffLatest.value === fx.DFF.observations[fx.DFF.observations.length - 1].value, 'fed funds latest matches raw');
ok(raw('DFF', data.dates.ffHikeDate.date)! === F.ffHikeTo.value, 'fed funds after hike matches raw');
{
  const dff = fx.DFF.observations;
  const i = dff.findIndex((o) => o.date === data.dates.ffHikeDate.date);
  ok(i > 0 && dff[i - 1].value === F.ffHikeFrom.value, `fed funds before hike = previous day's rate (${dff[i - 1]?.value})`);
  ok(near(F.ffHikeSize.value, F.ffHikeTo.value - F.ffHikeFrom.value), 'hike size = to − from');
}
// Brute-force checks of the remaining narrative facts.
{
  const in2020 = fx.DGS10.observations.filter((o) => o.date.startsWith('2020') && o.value !== null).map((o) => o.value!);
  ok(F.y10Low2020.value === Math.min(...in2020), '2020 low of the 10-year yield');
  const monthAvg = (id: keyof Fixtures, ym: string) => {
    const v = fx[id].observations.filter((o) => o.date.startsWith(ym) && o.value !== null).map((o) => o.value!);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const months = (y0: number) => Array.from({ length: 24 }, (_, k) => `${y0 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`);
  ok(F.cashBeatBondsMonths.value === months(2023).filter((m) => monthAvg('DFF', m) > monthAvg('DGS10', m)).length, 'months 2023–24 with fed funds > 10y');
  ok(F.negativeRealMonths.value === months(2020).filter((m) => monthAvg('DFII10', m) < 0).length, 'months 2020–21 with negative real yield');
}
const gdp = fx.A191RL1Q225SBEA.observations;
ok(F.gdpLatest.value === gdp[gdp.length - 1].value, 'GDP latest matches raw');
ok(F.gdpPrev.value === gdp[gdp.length - 2].value, 'previous-quarter GDP matches raw');
ok(near(F.realPolicy.value, F.ffLatest.value - F.coreYoyLatest.value), 'real policy rate arithmetic');
ok(near(F.y10OverFf.value, F.y10Latest.value - F.ffLatest.value), '10y minus fed funds arithmetic');
ok(data.cutoff === theBondComeback.dataCutoff, `article dataCutoff (${theBondComeback.dataCutoff}) = latest observation (${data.cutoff})`);

// Charts: every plotted point is finite and dates ascend.
for (const c of Object.values(data.charts)) {
  for (const s of c.series) {
    ok(s.points.length > 1 && s.points.every((p) => Number.isFinite(p.value)), `chart ${c.id}/${s.key}: finite points`);
    ok(s.points.every((p, i) => i === 0 || p.date > s.points[i - 1].date), `chart ${c.id}/${s.key}: ascending`);
    if (c.yDomain) ok(s.points.every((p) => p.value >= c.yDomain![0] && p.value <= c.yDomain![1]), `chart ${c.id}/${s.key}: within y-domain`);
  }
}

// ── 3. Article copy ──────────────────────────────────────────────────
const strings: string[] = [];
const walk = (v: unknown) => {
  if (typeof v === 'string') strings.push(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
};
walk(theBondComeback);
let tokenCount = 0;
for (const s of strings) {
  tokenCount += listTokens(s).length;
  try {
    resolveTokens(s, data);
  } catch (e) {
    ok(false, `copy token: ${(e as Error).message} in "${s.slice(0, 60)}…"`);
  }
  // Numbers with % or "pp" must come from tokens, never typed into copy.
  const stripped = s.replace(/\{[^}]+\}/g, '');
  ok(!/\d(\.\d+)?\s?(%|pp\b|percentage point)/.test(stripped), `no hardcoded percentages: "${stripped.slice(0, 70)}…"`);
}

// ── 4. References ────────────────────────────────────────────────────
const chartIds = Object.keys(data.charts);
const blocks = [...theBondComeback.narrative.blocks, ...theBondComeback.macro.charts, theBondComeback.analytics.chart];
for (const b of blocks) if (b.type === 'chart') ok(chartIds.includes(b.chartId), `chart "${b.chartId}" exists`);
const indicatorKeys = data.indicators.map((i) => i.key);
for (const i of theBondComeback.macro.indicators) ok(indicatorKeys.includes(i.key), `indicator "${i.key}" exists`);

console.log(`\n${checks - failures}/${checks} checks passed · ${tokenCount} fact tokens resolved · cutoff ${data.cutoff}`);
for (const id of REQUIRED_SERIES) console.log(`  ${id.padEnd(16)} ${fx[id].window.start} → ${fx[id].window.end}  retrieved ${fx[id].retrievedAt}`);
if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
