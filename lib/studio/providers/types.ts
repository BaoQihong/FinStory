// Provider interfaces. The pipeline depends only on these, so tests inject
// deterministic fakes and production wires the real HTTP clients.
import type { Observation } from '../../data/types.ts';

export type SearchResult = {
  url: string;
  title: string;
  content: string;
  score: number | null;
  publishedDate: string | null;
};

export interface SearchProvider {
  readonly name: string;
  search(query: string, opts: { recent: boolean; maxResults: number }): Promise<{ results: SearchResult[]; credits: number; ms: number }>;
  /** Fetch fuller text for a few URLs (provider-side extraction, respecting the provider's crawl policy). */
  extract(urls: string[], query: string): Promise<{ results: { url: string; content: string }[]; credits: number; ms: number }>;
}

/** Metadata of a candidate series, as reported by the provider (never by the LLM). */
export type SeriesMeta = {
  provider: 'fred' | 'tiingo' | 'eia';
  id: string;
  title: string;
  units: string;
  frequency: string;
  seasonalAdjustment: string | null;
  observationStart: string;
  observationEnd: string;
  notes: string;
  sourceUrl: string;
  popularity: number | null;
};

export type SeriesData = {
  meta: SeriesMeta;
  observations: Observation[];
  transformations: string[];
  retrievedAt: string;
  sha256: string;
  calls: number;
  ms: number;
};

export interface DataProvider {
  readonly id: 'fred' | 'tiingo' | 'eia';
  readonly name: string;
  readonly short: string;
  readonly enabled: boolean;
  search?(text: string, limit: number): Promise<SeriesMeta[]>;
  meta(id: string): Promise<SeriesMeta | null>;
  fetch(id: string, start: string): Promise<SeriesData>;
}
