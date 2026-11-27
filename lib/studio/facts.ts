// Deterministic data products for generated articles.
//
// Retrieved datasets → (optional) derived series → facts, indicator cards and
// chart data. Pure functions with no I/O: the pipeline stores the output with
// the draft, and the validator recomputes from the same inputs. The LLM only
// ever *refers* to these products by key; it never computes a value.
import type { Observation, Point, SourceRef } from '../data/types.ts';
import type { ChartColor, ChartData, DateFact, Fact, IndicatorCard } from '../data/display.ts';
import { asOf, between, difference, extreme, lastAtOrAbove, latest, monthlyAverage, nonNull, round, shiftMonths, thin, yoyPercent } from '../data/transforms.ts';
import { fmtMonthShort } from '../format.ts';
import { formatDate, formatFact } from '../content/tokens.ts';
import { frequencyClass, fxQuote, sameAxis, unitInfo, type UnitInfo } from './units.ts';

export type Dataset = {
  key: string;
  provider: string;
  providerShort: string;
  seriesId: string;
  name: string;
  units: string;
  frequency: string;
  seasonalAdjustment: string | null;
  definition: string;
  sourceUrl: string;
  retrievedAt: string;
  transformations: string[];
  observations: Observation[];
  sha256: string;
};

/** A series as displayed: raw dataset, or derived deterministically from datasets. */
export type Series = {
  key: string;
  label: string;
  units: string;
  frequency: string;
  derivation: string;
  inputs: string[]; // dataset keys
  observations: Observation[];
};

export type DerivedSpec =
  | { key: string; op: 'yoy'; of: string; label: string }
  | { key: string; op: 'difference'; a: string; b: string; label: string }
  /** Re-express a series priced in a foreign currency in the FX series' base currency (e.g. Nikkei in US dollars). */
  | { key: string; op: 'convert'; a: string; fx: string; label: string };

export type ChartSpecInput = { id: string; seriesKeys: string[]; from?: string };

export type DataProducts = {
  series: Record<string, Series>;
  facts: Record<string, Fact>;
  dates: Record<string, DateFact>;
  indicators: IndicatorCard[];
  charts: Record<string, ChartData>;
  sources: SourceRef[];
  /** Deterministic plain-language statements about each series (fed to the writing stages). */
  observations: string[];
  issues: string[];
};

const precisionFor = (freq: string): 'day' | 'month' | 'quarter' | 'year' => {
  const c = frequencyClass(freq);
  if (c === 'annual') return 'year';
  if (c === 'monthly') return 'month';
  if (c === 'quarterly') return 'quarter';
  return 'day';
};

export function sourceRefOf(d: Dataset): SourceRef {
  const pts = nonNull(d.observations);
  return {
    seriesId: d.seriesId,
    name: d.name,
    provider: d.provider,
    short: d.providerShort,
    url: d.sourceUrl,
    units: d.units,
    frequency: d.frequency,
    retrievedAt: d.retrievedAt,
    lastObservation: pts.length ? pts[pts.length - 1].date : '',
  };
}

const toObs = (pts: Point[]): Observation[] => pts.map((p) => ({ date: p.date, value: p.value }));

/** Daily/weekly → calendar-month averages; monthly passes through; others unsupported. */
function toMonthly(s: Series): Observation[] | null {
  const c = frequencyClass(s.frequency);
  if (c === 'monthly') return s.observations.map((o) => ({ date: `${o.date.slice(0, 7)}-01`, value: o.value }));
  if (c === 'daily' || c === 'weekly') return toObs(monthlyAverage(s.observations, 3));
  return null;
}

const fxNote = (units: string) => {
  const fx = fxQuote(units);
  return fx ? ` Quoted as ${fx.quote} per one ${fx.base}; a rise means the ${fx.quote} weakened.` : '';
};

export function deriveSeries(datasets: Dataset[], specs: DerivedSpec[]): { series: Record<string, Series>; issues: string[] } {
  const series: Record<string, Series> = {};
  const issues: string[] = [];
  for (const d of datasets) {
    series[d.key] = {
      key: d.key,
      label: d.name,
      units: d.units,
      frequency: d.frequency,
      derivation: `${d.transformations.length ? d.transformations.join('; ') : `As published by ${d.providerShort} (${d.seriesId}).`}${fxNote(d.units)}`,
      inputs: [d.key],
      observations: d.observations,
    };
  }
  for (const spec of specs) {
    if (series[spec.key]) {
      issues.push(`Derived series "${spec.key}" skipped: key already in use.`);
      continue;
    }
    if (spec.op === 'convert') {
      const a = series[spec.a];
      const fxS = series[spec.fx];
      const q = fxS ? fxQuote(fxS.units) : null;
      if (!a || !fxS) { issues.push(`Derived series "${spec.key}" skipped: unknown input.`); continue; }
      if (!q) { issues.push(`"${spec.key}": ${fxS.label} is not an exchange rate quoted as currency per one unit of another; skipped.`); continue; }
      if (unitInfo(a.units).kind === 'rate') { issues.push(`"${spec.key}": cannot currency-convert a rate series; skipped.`); continue; }
      const daily = frequencyClass(a.frequency) === 'daily' && frequencyClass(fxS.frequency) === 'daily';
      const am = daily ? a.observations : toMonthly(a);
      const fm = daily ? fxS.observations : toMonthly(fxS);
      if (!am || !fm) { issues.push(`"${spec.key}": cannot align ${a.frequency} with ${fxS.frequency}; skipped.`); continue; }
      const fxMap = new Map(fm.map((o) => [o.date, o.value]));
      const obs: Observation[] = [];
      for (const o of am) {
        const r = fxMap.get(o.date);
        if (o.value === null || r === null || r === undefined || r === 0) continue;
        obs.push({ date: o.date, value: Math.round((o.value / r) * 1e4) / 1e4 });
      }
      const isIndex = unitInfo(a.units).kind === 'index';
      series[spec.key] = {
        key: spec.key,
        label: spec.label,
        units: isIndex ? `Index (${a.label} converted to ${q.base})` : `${q.base}s per unit`,
        frequency: daily ? 'Daily' : 'Monthly',
        derivation: `${a.label} divided by ${fxS.label} (${q.quote} per one ${q.base}) ${daily ? 'on days where both exist' : 'using calendar-month values'}: the ${q.base}-terms value an unhedged ${q.base}-based investor would see. Changes in this series = local-currency change combined with the currency move.`,
        inputs: [...new Set([...a.inputs, ...fxS.inputs])],
        observations: obs,
      };
      continue;
    }
    if (spec.op === 'yoy') {
      const src = series[spec.of];
      if (!src) { issues.push(`Derived series "${spec.key}" skipped: unknown input "${spec.of}".`); continue; }
      const kind = unitInfo(src.units).kind;
      if (kind === 'rate') { issues.push(`"${spec.key}": year-over-year % change of a rate series (${src.units}) is not meaningful; skipped.`); continue; }
      const monthly = toMonthly(src);
      if (!monthly) { issues.push(`"${spec.key}": ${src.frequency} data cannot be converted to monthly; skipped.`); continue; }
      const converted = frequencyClass(src.frequency) !== 'monthly';
      series[spec.key] = {
        key: spec.key,
        label: spec.label,
        units: 'Percent change from a year earlier',
        frequency: 'Monthly',
        derivation: `${converted ? 'Calendar-month averages of ' : ''}${src.label} (${src.inputs.join(', ')}), then 100 × (value ÷ value 12 months earlier − 1). Months with a missing observation are omitted.`,
        inputs: src.inputs,
        observations: toObs(yoyPercent(monthly, 2)),
      };
    } else {
      const a = series[spec.a];
      const b = series[spec.b];
      if (!a || !b) { issues.push(`Derived series "${spec.key}" skipped: unknown input.`); continue; }
      if (!sameAxis(a.units, b.units)) { issues.push(`"${spec.key}": cannot subtract ${b.units} from ${a.units} (different units); skipped.`); continue; }
      const fa = frequencyClass(a.frequency);
      const fb = frequencyClass(b.frequency);
      let obs: Observation[];
      let how: string;
      let freq: string;
      if (fa === 'daily' && fb === 'daily') {
        obs = toObs(difference(a.observations, b.observations, 3));
        how = 'on days where both series have an observation';
        freq = 'Daily';
      } else {
        const ma = toMonthly(a);
        const mb = toMonthly(b);
        if (!ma || !mb) { issues.push(`"${spec.key}": cannot align ${a.frequency} with ${b.frequency}; skipped.`); continue; }
        obs = toObs(difference(ma, mb, 3));
        how = `using calendar-month values (daily or weekly data averaged by month) in months where both exist`;
        freq = 'Monthly';
      }
      const kind = unitInfo(a.units).kind;
      series[spec.key] = {
        key: spec.key,
        label: spec.label,
        units: kind === 'rate' ? 'Percentage points' : a.units,
        frequency: freq,
        derivation: `${a.label} minus ${b.label}, ${how}.`,
        inputs: [...new Set([...a.inputs, ...b.inputs])],
        observations: obs,
      };
    }
  }
  return { series, issues };
}

/** Unit info for a series; a difference of rates is in percentage points. */
function seriesUnit(s: Series): UnitInfo {
  if (s.units === 'Percentage points') return { kind: 'rate', display: { prefix: '', suffix: ' pp' }, label: 'percentage points', decimals: 2 };
  return unitInfo(s.units);
}

function valueFact(s: Series, p: Point, method: string): Fact {
  // Small dollar amounts (e.g. $0.183 per kWh) keep three decimals.
  const base0 = seriesUnit(s);
  const dollars = base0.kind === 'level' && base0.display.prefix === '$';
  const u = dollars && Math.abs(p.value) < 10 ? { ...base0, decimals: 3 } : dollars && Math.abs(p.value) >= 1000 ? { ...base0, decimals: 0 } : base0;
  const base = { value: round(p.value, u.decimals), decimals: u.decimals, date: p.date, datePrecision: precisionFor(s.frequency), seriesIds: s.inputs, method };
  if (s.units === 'Percentage points') return { ...base, format: 'pp' };
  if (u.kind === 'rate') return { ...base, format: 'pct' };
  if (u.kind === 'index') return { ...base, format: 'num' };
  return { ...base, format: 'level', unit: u.display };
}

function changeFact(s: Series, from: Point, to: Point, label: string): Fact {
  const u = seriesUnit(s);
  const fx = fxQuote(s.units);
  if (fx) {
    return {
      value: round(100 * (to.value / from.value - 1), 1),
      format: 'pct',
      decimals: 1,
      date: to.date,
      datePrecision: precisionFor(s.frequency),
      seriesIds: s.inputs,
      method: `Change in the NUMBER of ${fx.quote} per one ${fx.base} (a RISE means the ${fx.quote} WEAKENED), ${from.date} to ${to.date} (${label}): 100 × (${to.value} ÷ ${from.value} − 1).`,
    };
  }
  if (u.kind === 'rate') {
    return {
      value: round(to.value - from.value, 2),
      format: 'pp',
      decimals: 2,
      date: to.date,
      datePrecision: precisionFor(s.frequency),
      seriesIds: s.inputs,
      method: `${s.label}: ${to.date} value minus ${from.date} value (${label}), in percentage points.`,
    };
  }
  return {
    value: round(100 * (to.value / from.value - 1), 1),
    format: 'pct',
    decimals: 1,
    date: to.date,
    datePrecision: precisionFor(s.frequency),
    seriesIds: s.inputs,
    method: `${s.label}: percent change from ${from.date} to ${to.date} (${label}) = 100 × (${to.value} ÷ ${from.value} − 1).`,
  };
}

/** Standard fact set for one series. Keys are `${key}${Suffix}` — listed to the LLM verbatim. */
export function factsForSeries(s: Series): { facts: Record<string, Fact>; dates: Record<string, DateFact> } {
  const facts: Record<string, Fact> = {};
  const dates: Record<string, DateFact> = {};
  const pts = nonNull(s.observations);
  if (!pts.length) return { facts, dates };
  const last = latest(s.observations);
  facts[`${s.key}Latest`] = valueFact(s, last, `Latest available observation of ${s.label} (${s.inputs.join(', ')}).`);

  const yearAgo = asOf(s.observations, shiftMonths(last.date, -12));
  if (yearAgo && yearAgo.date < last.date) {
    facts[`${s.key}YearAgo`] = valueFact(s, yearAgo, `${s.label}: last observation on or before ${shiftMonths(last.date, -12)}.`);
    facts[`${s.key}Chg1y`] = changeFact(s, yearAgo, last, 'one year');
  }
  const fiveAgo = asOf(s.observations, shiftMonths(last.date, -60));
  if (fiveAgo && fiveAgo.date < last.date) {
    facts[`${s.key}FiveYearsAgo`] = valueFact(s, fiveAgo, `${s.label}: last observation on or before ${shiftMonths(last.date, -60)}.`);
    facts[`${s.key}Chg5y`] = changeFact(s, fiveAgo, last, 'five years');
  }
  // Exchange rates: change in the VALUE of the quoted currency, so prose never inverts direction.
  const fx = fxQuote(s.units);
  if (fx) {
    const pairs: [string, Point | null, string][] = [['1y', yearAgo, 'one year'], ['5y', fiveAgo, 'five years']];
    for (const [suffix, prior, label] of pairs) {
      if (!prior || prior.date >= last.date) continue;
      facts[`${s.key}ValueOf${fx.quoteWord}Chg${suffix}`] = {
        value: round(100 * (prior.value / last.value - 1), 1),
        format: 'pct',
        decimals: 1,
        date: last.date,
        datePrecision: precisionFor(s.frequency),
        seriesIds: s.inputs,
        method: `Change in the VALUE of the ${fx.quote} against the ${fx.base} over ${label} (negative = the ${fx.quote} weakened): 100 × (${prior.value} ÷ ${last.value} − 1).`,
      };
    }
  }
  // "Highest/lowest since …" — only when the gap is at least six months.
  const hiSince = lastAtOrAbove(pts, last.value, last.date);
  if (hiSince && hiSince.date <= shiftMonths(last.date, -6))
    dates[`${s.key}HighestSince`] = { date: hiSince.date, datePrecision: precisionFor(s.frequency), seriesIds: s.inputs, method: `The latest ${s.label} is the highest since this date (the last earlier observation at or above it).` };
  const loSince = pts.filter((p) => p.date < last.date).reverse().find((p) => p.value <= last.value);
  if (loSince && loSince.date <= shiftMonths(last.date, -6))
    dates[`${s.key}LowestSince`] = { date: loSince.date, datePrecision: precisionFor(s.frequency), seriesIds: s.inputs, method: `The latest ${s.label} is the lowest since this date (the last earlier observation at or below it).` };
  const windows: [string, string, string][] = [
    ['1y', shiftMonths(last.date, -12), 'the past year'],
    ['5y', shiftMonths(last.date, -60), 'the past five years'],
    ['All', pts[0].date, `the full retrieved history since ${pts[0].date}`],
  ];
  for (const [suffix, from, desc] of windows) {
    const w = between(pts, from);
    if (w.length < 2) continue;
    const hi = extreme(w, 'max');
    const lo = extreme(w, 'min');
    facts[`${s.key}High${suffix}`] = valueFact(s, hi, `Highest observation of ${s.label} over ${desc} (first occurrence).`);
    facts[`${s.key}Low${suffix}`] = valueFact(s, lo, `Lowest observation of ${s.label} over ${desc} (first occurrence).`);
  }
  dates[`${s.key}HistoryStart`] = { date: pts[0].date, datePrecision: precisionFor(s.frequency), seriesIds: s.inputs, method: `First observation retrieved for ${s.label}.` };
  // Event/flow series (e.g. currency interventions) are mostly zero: percent changes are meaningless.
  if (isMostlyZero(s)) for (const k of Object.keys(facts)) if (/Chg(1y|5y)$/.test(k)) delete facts[k];
  // Never let a non-finite number (e.g. division by a zero base) become a fact.
  for (const [k, f] of Object.entries(facts)) if (!Number.isFinite(f.value)) delete facts[k];
  return { facts, dates };
}

/** More than half of the observations are exactly zero → an event or flow series, not a level. */
export function isMostlyZero(s: Series): boolean {
  const pts = nonNull(s.observations);
  return pts.length > 0 && pts.filter((p) => p.value === 0).length / pts.length > 0.5;
}

const COLORS: ChartColor[] = ['nominal', 'real', 'policy', 'breakeven'];

export function buildChart(spec: ChartSpecInput, series: Record<string, Series>, sourcesByKey: Record<string, SourceRef>): ChartData | string {
  const members = spec.seriesKeys.map((k) => series[k]);
  if (!members.length || members.some((m) => !m)) return `Chart "${spec.id}": unknown series ${spec.seriesKeys.filter((k) => !series[k]).join(', ')}.`;
  if (members.length > 4) return `Chart "${spec.id}": more than four series.`;
  const u0 = seriesUnit(members[0]);
  if (members.some((m) => seriesUnit(m).label !== u0.label || seriesUnit(m).kind !== u0.kind))
    return `Chart "${spec.id}": series have different units (${members.map((m) => m.units).join(' / ')}) and cannot share an axis.`;
  const lastDate = members.map((m) => nonNull(m.observations).at(-1)?.date ?? '').sort().at(-1)!;
  const from = spec.from && /^\d{4}-\d{2}-\d{2}$/.test(spec.from) ? spec.from : shiftMonths(lastDate, -60);
  const spanMonths = (Number(lastDate.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(lastDate.slice(5, 7)) - Number(from.slice(5, 7)));
  const out: ChartData['series'] = [];
  for (const [i, m] of members.entries()) {
    let pts = between(nonNull(m.observations), from);
    const daily = frequencyClass(m.frequency) === 'daily';
    if (daily && spanMonths > 30) pts = thin(pts, 5);
    if (pts.length < 2) return `Chart "${spec.id}": "${m.key}" has fewer than two observations after ${from}.`;
    out.push({
      key: m.key,
      label: m.label,
      units: m.units,
      frequency: daily && spanMonths > 30 ? `${m.frequency}, every 5th observation shown` : m.frequency,
      sourceSeriesIds: m.inputs,
      derivation: m.derivation,
      points: pts,
      color: COLORS[i],
      dashed: i === 3,
    });
  }
  const sources = [...new Set(members.flatMap((m) => m.inputs))].map((k) => sourcesByKey[k]).filter(Boolean);
  const annotations: ChartData['annotations'] = [];
  if (out.length === 1) {
    const hi = extreme(out[0].points, 'max');
    const v = hi.value.toFixed(u0.decimals);
    annotations.push({ seriesKey: out[0].key, date: hi.date, value: hi.value, label: `High ${u0.display.prefix}${v}${u0.kind === 'rate' ? u0.display.suffix : ''} · ${fmtMonthShort(hi.date)}` });
  }
  return {
    id: spec.id,
    series: out,
    annotations,
    xTickFormat: spanMonths > 24 ? 'year' : 'month',
    sources,
    notes: [...new Set(members.map((m) => m.derivation))],
    unit: u0.kind === 'rate' && u0.display.suffix === '%' ? undefined : { ...u0.display, label: u0.label },
  };
}

export function buildIndicator(s: Series, source: SourceRef): IndicatorCard | null {
  const pts = nonNull(s.observations);
  if (pts.length < 2) return null;
  const last = latest(s.observations);
  const u = seriesUnit(s);
  const yearAgo = asOf(s.observations, shiftMonths(last.date, -12));
  const monthly = frequencyClass(s.frequency) === 'daily' || frequencyClass(s.frequency) === 'weekly' ? monthlyAverage(s.observations, 3) : pts;
  const spark = between(monthly, shiftMonths(last.date, -24));
  const isPct = u.kind === 'rate' && u.display.suffix === '%';
  let change: IndicatorCard['change'];
  if (yearAgo && yearAgo.date < last.date && (u.kind === 'rate' || yearAgo.value !== 0) && !isMostlyZero(s)) {
    change = u.kind === 'rate'
      ? { value: round(last.value - yearAgo.value, 2), versus: `a year earlier (${yearAgo.date})` }
      : { value: round(100 * (last.value / yearAgo.value - 1), 1), versus: `a year earlier (${yearAgo.date})` };
  }
  return {
    key: s.key,
    label: s.label,
    value: round(last.value, u.decimals),
    decimals: u.decimals,
    unit: isPct ? '%' : 'level',
    display: isPct ? undefined : { prefix: u.display.prefix, suffix: u.display.suffix, changeSuffix: u.kind === 'rate' ? ' pp' : '%' },
    asOf: last.date,
    asOfPrecision: precisionFor(s.frequency),
    change,
    spark: spark.length >= 2 ? spark : pts.slice(-24),
    source,
    method: `${s.derivation} Change compares the latest value with the last observation on or before the same date a year earlier${u.kind === 'rate' ? ', in percentage points' : ', as a percent change'}.`,
  };
}

const pts0 = (s: Series) => nonNull(s.observations)[0]?.date ?? '';

/** Plain, deterministic statements about where each series stands — guards against wrong superlatives. */
export function describeSeries(s: Series, facts: Record<string, Fact>, dates: Record<string, DateFact>): string[] {
  const f = (k: string) => facts[`${s.key}${k}`];
  const latestF = f('Latest');
  if (!latestF) return [];
  const out: string[] = [];
  const fx = fxQuote(s.units);
  const fmt = (x: Fact) => `${formatFact(x)}${x.date ? ` (${formatDate(x.date, x.datePrecision)})` : ''}`;
  let line = `${s.label}: latest {${s.key}Latest} = ${fmt(latestF)}.`;
  if (fx) line += ` Quoted as ${fx.quote} per one ${fx.base}: a HIGHER number means a WEAKER ${fx.quote}.`;
  out.push(line);
  for (const w of ['1y', '5y', 'All'] as const) {
    const hi = f(`High${w}`);
    const lo = f(`Low${w}`);
    if (!hi || !lo) continue;
    const span = w === '1y' ? 'past year' : w === '5y' ? 'past five years' : `retrieved history since ${formatDate(pts0(s), precisionFor(s.frequency))} (NOT an all-time record — earlier data was not retrieved)`;
    const atHi = hi.date === latestF.date;
    const atLo = lo.date === latestF.date;
    out.push(`  Over the ${span}: high ${fmt(hi)}, low ${fmt(lo)}. The latest value ${atHi ? 'IS the high' : atLo ? 'IS the low' : 'is NEITHER the high nor the low'} of this window.`);
  }
  const hs = dates[`${s.key}HighestSince`];
  const ls = dates[`${s.key}LowestSince`];
  if (hs) out.push(`  The latest value is the highest since {${s.key}HighestSince} (${formatDate(hs.date, hs.datePrecision)}).`);
  if (ls) out.push(`  The latest value is the lowest since {${s.key}LowestSince} (${formatDate(ls.date, ls.datePrecision)}).`);
  return out;
}

export function buildDataProducts(datasets: Dataset[], derived: DerivedSpec[], charts: ChartSpecInput[]): DataProducts {
  const { series, issues } = deriveSeries(datasets, derived);
  const sourcesByKey = Object.fromEntries(datasets.map((d) => [d.key, sourceRefOf(d)]));
  const facts: Record<string, Fact> = {};
  const dates: Record<string, DateFact> = {};
  const indicators: IndicatorCard[] = [];
  const observations: string[] = [];
  for (const s of Object.values(series)) {
    const f = factsForSeries(s);
    Object.assign(facts, f.facts);
    Object.assign(dates, f.dates);
    observations.push(...describeSeries(s, f.facts, f.dates));
    if (isMostlyZero(s)) issues.push(`${s.label} (${s.inputs.join(', ')}) is mostly zeros — an event or flow series, not a price or rate; percent changes were not computed. Check it is the intended dataset.`);
    const src = sourcesByKey[s.inputs[0]];
    const card = src ? buildIndicator(s, src) : null;
    if (card) indicators.push(card);
    else issues.push(`Series "${s.key}" has too few observations for an indicator card.`);
  }
  const chartOut: Record<string, ChartData> = {};
  for (const c of charts) {
    const r = buildChart(c, series, sourcesByKey);
    if (typeof r === 'string') issues.push(r);
    else chartOut[c.id] = r;
  }
  return { series, facts, dates, indicators, charts: chartOut, sources: Object.values(sourcesByKey), observations, issues };
}
