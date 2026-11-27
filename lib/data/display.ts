// Display-level structures consumed by editorial chart / indicator components.
import type { DisplaySeries, Point, SourceRef } from './types.ts';

/** A number the article states, with the observation(s) that back it. */
export type Fact = {
  value: number;
  /** How to render: 'pct' → "4.91%", 'pp' → "1.34 percentage points", 'num' → plain. */
  format: 'pct' | 'pp' | 'num' | 'level' | 'text';
  decimals: number;
  /** For 'level' facts: how to dress the number, e.g. { prefix: '$', suffix: ' a barrel' }. */
  unit?: UnitDisplay;
  /** For 'text' facts — a figure quoted verbatim from a source document. */
  text?: string;
  /** Research source refs ("S3") backing a 'text' fact. */
  sourceRefs?: string[];
  /** Observation date (ISO) the value refers to, if a single date. */
  date?: string;
  /** Precision of `date` for display: day → "24 Nov 2026", month → "Oct 2026", quarter → "Q3 2026". */
  datePrecision?: 'day' | 'month' | 'quarter' | 'year';
  /** Series used, for traceability. */
  seriesIds: string[];
  /** Plain-language description of how the value was obtained. */
  method: string;
};

/** A date the article states (e.g. "highest since …"), with backing. */
export type DateFact = {
  date: string;
  datePrecision: 'day' | 'month' | 'quarter' | 'year';
  seriesIds: string[];
  method: string;
};

export type IndicatorCard = {
  key: string;
  label: string;
  value: number;
  decimals: number;
  unit: '%' | 'level';
  /** Display for non-percent indicators (default: '%' value, 'pp' change). */
  display?: { prefix: string; suffix: string; changeSuffix: string };
  asOf: string;
  asOfPrecision: 'day' | 'month' | 'quarter' | 'year';
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
  /** Y-axis / tooltip unit. Omitted = percent ("4.5%"). All series in a chart share it. */
  unit?: UnitDisplay & { label: string };
  sources: SourceRef[];
  notes: string[];
};

export type ChartColor = 'nominal' | 'real' | 'breakeven' | 'policy' | 'inflation';

/** Prefix/suffix around a number, e.g. { prefix: '$', suffix: '' } or { prefix: '', suffix: ' yen' }. */
export type UnitDisplay = { prefix: string; suffix: string };
