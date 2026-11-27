import type { ChartColor, ChartData } from '@/lib/data/display';

// Validated against the cream chart surface with the dataviz palette checker
// (lightness band, chroma, CVD separation, contrast ≥ 3:1). Policy/inflation
// sit in the CVD floor band, so the inflation line is always dashed and
// every line is direct-labelled or listed in a legend.
export const SERIES_COLORS: Record<ChartColor, string> = {
  nominal: '#3158a5',
  real: '#b97a12',
  breakeven: '#0e968c',
  policy: '#a04f9a',
  inflation: '#0e968c',
};

/** The subset of ChartData sent to the browser (no provenance blobs). */
export type ClientChart = {
  series: { key: string; label: string; color: ChartColor; dashed?: boolean; points: { date: string; value: number }[] }[];
  annotations: ChartData['annotations'];
  highlight?: ChartData['highlight'];
  yDomain?: [number, number];
  yTickStep?: number;
  xTickFormat: 'year' | 'month';
  pointFrequency: 'daily' | 'monthly';
  /** Value dressing; defaults to percent. */
  unit: { prefix: string; suffix: string; label: string };
};

export const PERCENT_UNIT = { prefix: '', suffix: '%', label: '%' };

export function toClientChart(c: ChartData): ClientChart {
  return {
    series: c.series.map((s) => ({ key: s.key, label: s.label, color: s.color, dashed: s.dashed, points: s.points })),
    annotations: c.annotations,
    highlight: c.highlight,
    yDomain: c.yDomain,
    yTickStep: c.yTickStep,
    xTickFormat: c.xTickFormat,
    pointFrequency: c.series.every((s) => s.frequency.toLowerCase().startsWith('daily')) ? 'daily' : 'monthly',
    unit: c.unit ?? PERCENT_UNIT,
  };
}
