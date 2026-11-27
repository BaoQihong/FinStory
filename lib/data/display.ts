// Display-level structures consumed by editorial chart / indicator components.
import type { DisplaySeries, Point, SourceRef } from './types.ts';

/** A number the article states, with the observation(s) that back it. */
export type Fact = {
  value: number;
  /** How to render: 'pct' → "4.91%", 'pp' → "1.34 percentage points", 'num' → plain. */
  format: 'pct' | 'pp' | 'num';
  decimals: number;
  /** Observation date (ISO) the value refers to, if a single date. */
  date?: string;
  /** Precision of `date` for display: day → "24 Nov 2026", month → "Oct 2026", quarter → "Q3 2026". */
  datePrecision?: 'day' | 'month' | 'quarter';
  /** Series used, for traceability. */
  seriesIds: string[];
  /** Plain-language description of how the value was obtained. */
  method: string;
};

/** A date the article states (e.g. "highest since …"), with backing. */
export type DateFact = {
  date: string;
  datePrecision: 'day' | 'month' | 'quarter';
  seriesIds: string[];
  method: string;
};

export type IndicatorCard = {
  key: string;
  label: string;
  value: number;
  decimals: number;
  unit: '%';
  asOf: string;
  asOfPrecision: 'day' | 'month' | 'quarter';
  /** Change versus a stated comparison point (percentage points). */
  change?: { value: number; versus: string };
  /** Short history for the sparkline. */
  spark: Point[];
  source: SourceRef;
  /** Calculation note shown in the card's detail disclosure. */
  method: string;
};

export type Annotation = {
  seriesKey: string;
  date: string;
  value: number;
  label: string;
  /** Label placement relative to the point (default above). */
  position?: 'top' | 'bottom';
  /** Extra upward offset in px, to keep a label clear of nearby lines. */
  lift?: number;
};

/** Data half of a chart, produced from fixtures. Editorial copy (question, takeaway) lives in content. */
export type ChartData = Omit<ChartSpec, 'question' | 'takeaway'>;

export type ChartSpec = {
  id: string;
  /** The question the chart answers — shown as the chart title. */
  question: string;
  /** The single sentence a reader should leave with. */
  takeaway: string;
  series: (DisplaySeries & { color: ChartColor; dashed?: boolean })[];
  annotations: Annotation[];
  /** Optional shaded period, e.g. the 2026 rise. */
  highlight?: { from: string; to: string; label: string };
  yDomain?: [number, number];
  yTickStep?: number;
  /** x-axis tick formatting granularity */
  xTickFormat: 'year' | 'month';
  sources: SourceRef[];
  notes: string[];
};

export type ChartColor = 'nominal' | 'real' | 'breakeven' | 'policy' | 'inflation';
