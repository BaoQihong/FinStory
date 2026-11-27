// Standardized financial data structures. Chart and indicator components
// consume these shapes only — never hardcoded presentation values — so that
// Phase 3 can swap static fixtures for automated retrieval without touching UI.

export type Observation = { date: string; value: number | null };

/** A raw series exactly as stored in data/<provider>/<id>.json. */
export type SeriesFixture = {
  schemaVersion: 1;
  source: {
    provider: string;
    seriesUrl: string;
    downloadUrl: string;
    downloadSha256: string;
  };
  seriesId: string;
  name: string;
  shortName: string;
  description: string;
  units: string;
  frequency: string;
  seasonalAdjustment: string;
  retrievedAt: string;
  window: { start: string; end: string };
  transformations: string[];
  observations: Observation[];
};

/** A clean, plottable point (nulls already resolved by the transform that produced it). */
export type Point = { date: string; value: number };

/** A series ready for display: raw or derived, with provenance carried along. */
export type DisplaySeries = {
  key: string;
  label: string;
  units: string;
  frequency: string;
  /** FRED (or other) series ids this was built from. */
  sourceSeriesIds: string[];
  /** Plain-language description of every calculation applied. */
  derivation: string;
  points: Point[];
};

/** Reference to a source series used for citation blocks. */
export type SourceRef = {
  seriesId: string;
  name: string;
  provider: string;
  url: string;
  units: string;
  frequency: string;
  retrievedAt: string;
  lastObservation: string;
};
