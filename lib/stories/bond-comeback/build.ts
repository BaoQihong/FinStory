// Builds every number, indicator and chart dataset for "The Bond Comeback"
// from FRED fixtures. Pure function: the Next.js page and the validation
// script (scripts/data/validate-fixtures.ts) both call it, so what is
// displayed is exactly what is validated.
import type { SeriesFixture, SourceRef } from '../../data/types.ts';
import type { ChartData, DateFact, Fact, IndicatorCard } from '../../data/display.ts';
import {
  annualizedPercent,
  asOf,
  between,
  difference,
  extreme,
  lastAtOrAbove,
  latest,
  monthlyAverage,
  nonNull,
  round,
  shiftMonths,
  stepChanges,

  valueOn,
  yoyPercent,
} from '../../data/transforms.ts';
import { fmtDay, fmtDayShort, fmtMonth, fmtMonthShort } from '../../format.ts';

export const REQUIRED_SERIES = ['DGS10', 'DFII10', 'DFF', 'CPILFESL', 'A191RL1Q225SBEA'] as const;
export type Fixtures = Record<(typeof REQUIRED_SERIES)[number], SeriesFixture>;

/** The 2026 move the story is about is measured from the year's low to its high in DGS10. */
const STORY_YEAR_START = '2026-01-01';
const LONG_VIEW_START = '2006-01-01';
const POLICY_VIEW_START = '2019-01-01';

export function sourceRef(f: SeriesFixture): SourceRef {
  return {
    seriesId: f.seriesId,
    name: f.shortName,
    provider: 'FRED, Federal Reserve Bank of St. Louis',
    url: f.source.seriesUrl,
    units: f.units,
    frequency: f.frequency,
    retrievedAt: f.retrievedAt,
    lastObservation: latest(f.observations).date,
  };
}

function must(v: number | null, what: string): number {
  if (v === null) throw new Error(`missing observation: ${what}`);
  return v;
}

export function buildBondComeback(fx: Fixtures) {
  const dgs = fx.DGS10.observations;
  const dfii = fx.DFII10.observations;
  const dff = fx.DFF.observations;
  const cpi = fx.CPILFESL.observations;
  const gdp = fx.A191RL1Q225SBEA.observations;
  const src = {
    DGS10: sourceRef(fx.DGS10),
    DFII10: sourceRef(fx.DFII10),
    DFF: sourceRef(fx.DFF),
    CPILFESL: sourceRef(fx.CPILFESL),
    A191RL1Q225SBEA: sourceRef(fx.A191RL1Q225SBEA),
  };

  // ── Yields ────────────────────────────────────────────────────────────
  const dgsPts = nonNull(dgs);
  const dfiiPts = nonNull(dfii);
  const breakeven = difference(dgs, dfii); // daily, dates where both exist
  const y10Latest = latest(dgs);
  const realLatest = latest(dfii);
  if (y10Latest.date !== realLatest.date) throw new Error('DGS10 and DFII10 latest dates differ');

  const story = between(dgsPts, STORY_YEAR_START);
  const y10Low = extreme(story, 'min');
  const y10Peak = extreme(story, 'max');
  if (y10Low.date >= y10Peak.date) throw new Error('expected the 2026 low to precede the 2026 peak');
  const y10PeakPrev = lastAtOrAbove(dgsPts, y10Peak.value, STORY_YEAR_START);
  const realAtLow = must(valueOn(dfii, y10Low.date), `DFII10 ${y10Low.date}`);
  const realAtPeak = must(valueOn(dfii, y10Peak.date), `DFII10 ${y10Peak.date}`);
  const realPeak = extreme(between(dfiiPts, STORY_YEAR_START), 'max');
  const realPeakPrev = lastAtOrAbove(dfiiPts, realPeak.value, STORY_YEAR_START);
  const beAtLow = round(y10Low.value - realAtLow, 2);
  const beAtPeak = round(y10Peak.value - realAtPeak, 2);
  const beLatest = round(y10Latest.value - realLatest.value, 2);
  const y10Low2020 = extreme(between(dgsPts, '2020-01-01', '2020-12-31'), 'min');
  const yearAgo = shiftMonths(y10Latest.date, -12);
  const y10YearAgo = asOf(dgs, yearAgo)!;
  const realYearAgo = asOf(dfii, yearAgo)!;

  // ── Inflation ─────────────────────────────────────────────────────────
  const coreYoy = yoyPercent(cpi);
  const coreYoyLatest = coreYoy[coreYoy.length - 1];
  const coreYoyYearAgo = coreYoy.find((p) => p.date === shiftMonths(coreYoyLatest.date, -12));
  const core3m = annualizedPercent(cpi, 3);
  const core3mLatest = core3m[core3m.length - 1];
  const coreLatestIndex = latest(cpi);
  const corePeak = extreme(between(coreYoy, '2021-01-01', '2023-12-31'), 'max');
  const cpiMissing = cpi.filter((o) => o.value === null).map((o) => o.date);
  // Months whose YoY rate cannot be computed because the year-earlier index is missing.
  const yoyUncomputable = cpi
    .filter((o) => o.value !== null && cpiMissing.includes(shiftMonths(o.date, -12)))
    .map((o) => o.date);

  // ── Policy & growth ───────────────────────────────────────────────────
  const ffLatest = latest(dff);
  const moves = stepChanges(dff, 0.2);
  const hikes = moves.filter((m) => m.to > m.from);
  const lastHike = hikes[hikes.length - 1];
  const prevHike = hikes[hikes.length - 2];
  const ffPeak = extreme(between(nonNull(dff), '2023-01-01', '2024-12-31'), 'max');
  const gdpPts = nonNull(gdp);
  const gdpLatest = gdpPts[gdpPts.length - 1];
  const gdpPrev = gdpPts[gdpPts.length - 2];

  const f = (
    value: number,
    format: Fact['format'],
    seriesIds: string[],
    method: string,
    date?: string,
    datePrecision: Fact['datePrecision'] = 'day',
    decimals = 2,
  ): Fact => ({ value, format, decimals, date, datePrecision: date ? datePrecision : undefined, seriesIds, method });

  const facts = {
    y10Latest: f(y10Latest.value, 'pct', ['DGS10'], 'Latest DGS10 observation.', y10Latest.date),
    y10YearAgo: f(y10YearAgo.value, 'pct', ['DGS10'], 'DGS10 on or before the same date one year earlier.', y10YearAgo.date),
    y10Low: f(y10Low.value, 'pct', ['DGS10'], 'Lowest DGS10 daily close in 2026.', y10Low.date),
    y10Peak: f(y10Peak.value, 'pct', ['DGS10'], 'Highest DGS10 daily close in 2026.', y10Peak.date),
    y10Rise: f(round(y10Peak.value - y10Low.value, 2), 'pp', ['DGS10'], '2026 high minus 2026 low.'),
    y10OffPeak: f(round(y10Peak.value - y10Latest.value, 2), 'pp', ['DGS10'], '2026 high minus latest.'),
    y10Low2020: f(y10Low2020.value, 'pct', ['DGS10'], 'Lowest DGS10 daily close in 2020.', y10Low2020.date),
    realLatest: f(realLatest.value, 'pct', ['DFII10'], 'Latest DFII10 observation.', realLatest.date),
    realAtLow: f(realAtLow, 'pct', ['DFII10'], 'DFII10 on the date of the 2026 DGS10 low.', y10Low.date),
    realAtPeak: f(realAtPeak, 'pct', ['DFII10'], 'DFII10 on the date of the 2026 DGS10 high.', y10Peak.date),
    realPeak: f(realPeak.value, 'pct', ['DFII10'], 'Highest DFII10 daily close in 2026.', realPeak.date),
    realRise: f(round(realAtPeak - realAtLow, 2), 'pp', ['DFII10'], 'DFII10 change between the dates of the 2026 DGS10 low and high.'),
    beAtLow: f(beAtLow, 'pct', ['DGS10', 'DFII10'], 'DGS10 minus DFII10 on the date of the 2026 DGS10 low.', y10Low.date),
    beAtPeak: f(beAtPeak, 'pct', ['DGS10', 'DFII10'], 'DGS10 minus DFII10 on the date of the 2026 DGS10 high.', y10Peak.date),
    beLatest: f(beLatest, 'pct', ['DGS10', 'DFII10'], 'Latest DGS10 minus DFII10.', y10Latest.date),
    beChange: f(round(beAtPeak - beAtLow, 2), 'pp', ['DGS10', 'DFII10'], 'Breakeven change between the dates of the 2026 DGS10 low and high.'),
    coreYoyLatest: f(coreYoyLatest.value, 'pct', ['CPILFESL'], 'Latest computable 12-month % change in the core CPI index.', coreYoyLatest.date, 'month'),
    coreYoyYearAgo: f(coreYoyYearAgo!.value, 'pct', ['CPILFESL'], '12-month % change in core CPI one year before the latest computable month.', coreYoyYearAgo!.date, 'month'),
    core3m: f(core3mLatest.value, 'pct', ['CPILFESL'], '3-month change in the core CPI index, annualized: ((I[t]/I[t−3])^4 − 1) × 100.', core3mLatest.date, 'month', 1),
    corePeak: f(corePeak.value, 'pct', ['CPILFESL'], 'Highest 12-month core CPI inflation, 2021–2023.', corePeak.date, 'month', 1),
    ffLatest: f(ffLatest.value, 'pct', ['DFF'], 'Latest effective federal funds rate.', ffLatest.date),
    ffHikeFrom: f(lastHike.from, 'pct', ['DFF'], 'Effective rate before the most recent increase of ≥0.20 pp.', lastHike.date),
    ffHikeTo: f(lastHike.to, 'pct', ['DFF'], 'Effective rate after the most recent increase of ≥0.20 pp.', lastHike.date),
    ffHikeSize: f(round(lastHike.to - lastHike.from, 2), 'pp', ['DFF'], 'Size of the most recent increase.'),
    ffPeak: f(ffPeak.value, 'pct', ['DFF'], 'Highest effective federal funds rate, 2023–2024.', ffPeak.date),
    realPolicy: f(round(ffLatest.value - coreYoyLatest.value, 2), 'pp', ['DFF', 'CPILFESL'], 'Latest effective fed funds rate minus latest 12-month core CPI inflation.'),
    y10OverFf: f(round(y10Latest.value - ffLatest.value, 2), 'pp', ['DGS10', 'DFF'], 'Latest DGS10 minus latest effective fed funds rate.'),
    gdpLatest: f(gdpLatest.value, 'pct', ['A191RL1Q225SBEA'], 'Latest quarterly real GDP growth, seasonally adjusted annual rate.', gdpLatest.date, 'quarter', 1),
    gdpPrev: f(gdpPrev.value, 'pct', ['A191RL1Q225SBEA'], 'Previous quarter real GDP growth, seasonally adjusted annual rate.', gdpPrev.date, 'quarter', 1),
    cashBeatBondsMonths: f(
      countMonths(monthlyAverage(dff), monthlyAverage(dgs), '2023-01-01', '2024-12-01', (ff, y) => ff > y),
      'num',
      ['DFF', 'DGS10'],
      'Months in 2023–2024 (of 24) in which the monthly average fed funds rate exceeded the monthly average 10-year yield.',
      undefined,
      undefined,
      0,
    ),
    negativeRealMonths: f(
      between(monthlyAverage(dfii), '2020-01-01', '2021-12-01').filter((p) => p.value < 0).length,
      'num',
      ['DFII10'],
      'Months in 2020–2021 (of 24) with a negative monthly average 10-year real yield.',
      undefined,
      undefined,
      0,
    ),
  } satisfies Record<string, Fact>;

  const d = (date: string, datePrecision: DateFact['datePrecision'], seriesIds: string[], method: string): DateFact => ({
    date,
    datePrecision,
    seriesIds,
    method,
  });
  const dates = {
    y10PeakPrevSince: d(y10PeakPrev!.date, 'month', ['DGS10'], 'Most recent date before 2026 with DGS10 at or above the 2026 high.'),
    realPeakPrevSince: d(realPeakPrev!.date, 'month', ['DFII10'], 'Most recent date before 2026 with DFII10 at or above the 2026 high.'),
    ffHikeDate: d(lastHike.date, 'day', ['DFF'], 'First day the effective rate reflected the most recent increase.'),
    ffPrevHike: d(prevHike.date, 'month', ['DFF'], 'Previous increase of ≥0.20 pp in the effective rate.'),
    cpiMissing: d(cpiMissing[0], 'month', ['CPILFESL'], 'Month with no published core CPI observation in FRED.'),
    coreIndexLatest: d(coreLatestIndex.date, 'month', ['CPILFESL'], 'Latest core CPI index observation.'),
    dataCutoff: d(y10Latest.date, 'day', ['DGS10', 'DFII10', 'DFF'], 'Latest daily observation used.'),
  } satisfies Record<string, DateFact>;

  // ── Indicator cards ───────────────────────────────────────────────────
  const monthly10 = monthlyAverage(dgs);
  const monthlyReal = monthlyAverage(dfii);
  const sparkFrom = shiftMonths(y10Latest.date.slice(0, 8) + '01', -23);
  const indicators: IndicatorCard[] = [
    {
      key: 'y10',
      label: '10-year Treasury yield',
      value: y10Latest.value,
      decimals: 2,
      unit: '%',
      asOf: y10Latest.date,
      asOfPrecision: 'day',
      change: { value: round(y10Latest.value - y10YearAgo.value, 2), versus: 'a year earlier' },
      spark: between(monthly10, sparkFrom),
      source: src.DGS10,
      method: `Daily close. Change compares with ${y10YearAgo.date}. Sparkline: monthly averages of daily closes, last 24 months.`,
    },
    {
      key: 'real',
      label: '10-year real yield',
      value: realLatest.value,
      decimals: 2,
      unit: '%',
      asOf: realLatest.date,
      asOfPrecision: 'day',
      change: { value: round(realLatest.value - realYearAgo.value, 2), versus: 'a year earlier' },
      spark: between(monthlyReal, sparkFrom),
      source: src.DFII10,
      method: `Yield on 10-year inflation-protected Treasuries (TIPS). Change compares with ${realYearAgo.date}. Sparkline: monthly averages, last 24 months.`,
    },
    {
      key: 'core',
      label: 'Core inflation (12-month)',
      value: coreYoyLatest.value,
      decimals: 2,
      unit: '%',
      asOf: coreYoyLatest.date,
      asOfPrecision: 'month',
      change: { value: round(coreYoyLatest.value - coreYoyYearAgo!.value, 2), versus: 'a year earlier' },
      spark: between(coreYoy, shiftMonths(coreYoyLatest.date, -23)),
      source: src.CPILFESL,
      method:
        `Calculated from the core CPI index: (index this month ÷ index 12 months earlier − 1) × 100. ` +
        `FRED has no core CPI observation for ${cpiMissing.join(', ')}, so 12-month rates for ${[...cpiMissing, ...yoyUncomputable].join(', ')} cannot be calculated and are omitted. ` +
        `The index itself is available through ${coreLatestIndex.date}.`,
    },
    {
      key: 'gdp',
      label: 'Real GDP growth',
      value: gdpLatest.value,
      decimals: 1,
      unit: '%',
      asOf: gdpLatest.date,
      asOfPrecision: 'quarter',
      change: { value: round(gdpLatest.value - gdpPrev.value, 2), versus: 'the previous quarter' },
      spark: gdpPts.slice(-8),
      source: src.A191RL1Q225SBEA,
      method: 'Quarter-on-quarter change in real GDP, expressed at a seasonally adjusted annual rate (as published by the BEA). Sparkline: last 8 quarters.',
    },
  ];

  // ── Charts ────────────────────────────────────────────────────────────
  const series = (
    key: string,
    label: string,
    units: string,
    frequency: string,
    ids: string[],
    derivation: string,
    points: { date: string; value: number }[],
  ) => ({ key, label, units, frequency, sourceSeriesIds: ids, derivation, points });

  const longNominal = between(monthly10, LONG_VIEW_START);
  const longReal = between(monthlyReal, LONG_VIEW_START);
  const longNomPeak = extreme(between(longNominal, STORY_YEAR_START), 'max');
  const longNomLow = extreme(longNominal, 'min');
  const hikeMonth = monthlyAverage(dff).find((p) => p.date === lastHike.date.slice(0, 8) + '01');
  if (!hikeMonth) throw new Error('no monthly fed funds average for the hike month');
  const charts = {
    longView: {
      id: 'long-view',
      series: [
        { ...series('nominal', '10-year yield', 'Percent', 'Monthly average', ['DGS10'], 'Monthly average of daily closes.', longNominal), color: 'nominal' as const },
        { ...series('real', '10-year real yield', 'Percent', 'Monthly average', ['DFII10'], 'Monthly average of daily closes.', longReal), color: 'real' as const },
      ],
      annotations: [
        { seriesKey: 'nominal', date: longNomLow.date, value: longNomLow.value, label: `${fmtMonth(longNomLow.date)}: ${longNomLow.value.toFixed(2)}%` },
        { seriesKey: 'nominal', date: longNomPeak.date, value: longNomPeak.value, label: `${fmtMonth(longNomPeak.date)}: ${longNomPeak.value.toFixed(2)}%` },
      ],
      yDomain: [-2, 6] as [number, number],
      yTickStep: 1,
      xTickFormat: 'year' as const,
      sources: [src.DGS10, src.DFII10],
      notes: [
        `Monthly averages of daily closes, ${fmtMonth(LONG_VIEW_START)}–${fmtMonth(y10Latest.date)} (${fmtMonth(y10Latest.date)} is a partial month through ${fmtDay(y10Latest.date)}). Monthly averages smooth out single-day highs: the highest daily close in 2026 was ${y10Peak.value.toFixed(2)}% on ${fmtDay(y10Peak.date)}.`,
      ],
    },
    thisYear: {
      id: 'this-year',
      series: [
        { ...series('nominal', '10-year yield', 'Percent', 'Daily', ['DGS10'], 'Daily close.', between(dgsPts, STORY_YEAR_START)), color: 'nominal' as const },
        { ...series('real', 'Real yield', 'Percent', 'Daily', ['DFII10'], 'Daily close.', between(dfiiPts, STORY_YEAR_START)), color: 'real' as const },
        {
          ...series('breakeven', 'Breakeven inflation', 'Percent', 'Daily', ['DGS10', 'DFII10'], 'DGS10 minus DFII10 on each date where both are published.', between(breakeven, STORY_YEAR_START)),
          color: 'breakeven' as const,
          dashed: true,
        },
      ],
      annotations: [
        { seriesKey: 'nominal', date: y10Low.date, value: y10Low.value, label: `${y10Low.value.toFixed(2)}%` },
        { seriesKey: 'nominal', date: y10Peak.date, value: y10Peak.value, label: `${y10Peak.value.toFixed(2)}%` },
        { seriesKey: 'real', date: y10Low.date, value: realAtLow, label: `${realAtLow.toFixed(2)}%`, position: 'bottom' as const },
        { seriesKey: 'real', date: y10Peak.date, value: realAtPeak, label: `${realAtPeak.toFixed(2)}%`, position: 'bottom' as const },
      ],
      highlight: { from: y10Low.date, to: y10Peak.date, label: `${fmtDayShort(y10Low.date)} – ${fmtDayShort(y10Peak.date)}` },
      yDomain: [1, 6] as [number, number],
      yTickStep: 1,
      xTickFormat: 'month' as const,
      sources: [src.DGS10, src.DFII10],
      notes: [
        'Breakeven inflation is the gap between the ordinary 10-year yield and the inflation-protected (TIPS) yield. It approximates the average inflation rate bond investors are pricing in, though it also includes risk and liquidity premiums.',
        `Days when either yield was not published (e.g. bond-market holidays) are omitted. Data through ${fmtDay(y10Latest.date)}.`,
      ],
    },
    policy: {
      id: 'policy',
      series: [
        {
          ...series('policy', 'Fed funds rate', 'Percent', 'Monthly average', ['DFF'], 'Monthly average of daily effective rates.', between(monthlyAverage(dff), POLICY_VIEW_START)),
          color: 'policy' as const,
        },
        {
          ...series('inflation', 'Core inflation', 'Percent', 'Monthly', ['CPILFESL'], '12-month % change in the core CPI index.', between(coreYoy, POLICY_VIEW_START)),
          color: 'inflation' as const,
          dashed: true,
        },
      ],
      annotations: [
        { seriesKey: 'inflation', date: corePeak.date, value: corePeak.value, label: `${corePeak.value.toFixed(1)}%` },
        { seriesKey: 'policy', date: hikeMonth.date, value: hikeMonth.value, label: `Rate rise, ${fmtMonthShort(lastHike.date)}`, lift: 22 },
      ],
      yDomain: [0, 7] as [number, number],
      yTickStep: 1,
      xTickFormat: 'year' as const,
      sources: [src.DFF, src.CPILFESL],
      notes: [
        `Core inflation is calculated from the core CPI index (12-month % change). ${fmtMonth(cpiMissing[0])} has no published index value, so that month is a gap in the line, and the 12-month rate for ${yoyUncomputable.map(fmtMonth).join(', ')} cannot be calculated (the line ends at ${fmtMonth(coreYoyLatest.date)}).`,
        'Fed funds shown as monthly averages of the daily effective rate.',
      ],
    },
  } satisfies Record<string, ChartData>;

  // ── Yield split (stacked comparison) ─────────────────────────────────
  const split = [
    { label: fmtDayShort(y10Low.date), sub: '2026 low', date: y10Low.date, nominal: y10Low.value, real: realAtLow, breakeven: beAtLow },
    { label: fmtDayShort(y10Peak.date), sub: '2026 high', date: y10Peak.date, nominal: y10Peak.value, real: realAtPeak, breakeven: beAtPeak },
    { label: fmtDayShort(y10Latest.date), sub: 'Latest', date: y10Latest.date, nominal: y10Latest.value, real: realLatest.value, breakeven: beLatest },
  ];

  return {
    facts,
    dates,
    indicators,
    charts,
    split,
    sources: Object.values(src),
    cutoff: y10Latest.date,
    cpiMissing,
  };
}

export type BondComebackData = ReturnType<typeof buildBondComeback>;
export type FactKey = keyof BondComebackData['facts'];
export type DateKey = keyof BondComebackData['dates'];

/** Count months in [from, to] where both monthly series exist and `test(a, b)` holds. */
function countMonths(
  a: { date: string; value: number }[],
  b: { date: string; value: number }[],
  from: string,
  to: string,
  test: (a: number, b: number) => boolean,
): number {
  const bMap = new Map(b.map((p) => [p.date, p.value]));
  return a.filter((p) => p.date >= from && p.date <= to && bMap.has(p.date) && test(p.value, bMap.get(p.date)!)).length;
}
