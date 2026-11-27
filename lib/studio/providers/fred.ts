// FRED (Federal Reserve Bank of St. Louis) — series search, metadata and
// observations through the official API. Missing values (".") become null.
import { createHash } from 'node:crypto';
import { fetchJson, type FetchLike } from './http.ts';
import type { DataProvider, SeriesData, SeriesMeta } from './types.ts';

type FredSeries = {
  id: string;
  title: string;
  units: string;
  frequency: string;
  seasonal_adjustment: string;
  observation_start: string;
  observation_end: string;
  notes?: string;
  popularity?: number;
};

const BASE = 'https://api.stlouisfed.org/fred';

export function fredProvider(apiKey: string | undefined, fetchImpl?: FetchLike): DataProvider {
  const q = (path: string, params: Record<string, string>) =>
    `${BASE}/${path}?${new URLSearchParams({ ...params, api_key: apiKey ?? '', file_type: 'json' })}`;
  const toMeta = (s: FredSeries): SeriesMeta => ({
    provider: 'fred',
    id: s.id,
    title: s.title,
    units: s.units,
    frequency: s.frequency,
    seasonalAdjustment: s.seasonal_adjustment,
    observationStart: s.observation_start,
    observationEnd: s.observation_end,
    notes: (s.notes ?? '').replace(/\s+/g, ' ').slice(0, 400),
    sourceUrl: `https://fred.stlouisfed.org/series/${s.id}`,
    popularity: s.popularity ?? null,
  });
  return {
    id: 'fred',
    name: 'FRED, Federal Reserve Bank of St. Louis',
    short: 'FRED',
    enabled: !!apiKey,
    async search(text, limit) {
      const { data } = await fetchJson<{ seriess?: FredSeries[] }>(
        q('series/search', { search_text: text, limit: String(limit), order_by: 'popularity', sort_order: 'desc' }),
        { label: 'FRED search', fetchImpl },
      );
      return (data.seriess ?? []).map(toMeta);
    },
    async meta(id) {
      try {
        const { data } = await fetchJson<{ seriess?: FredSeries[] }>(q('series', { series_id: id }), { label: 'FRED series', fetchImpl, retries: 1 });
        return data.seriess?.[0] ? toMeta(data.seriess[0]) : null;
      } catch {
        return null;
      }
    },
    async fetch(id, start): Promise<SeriesData> {
      const meta = await this.meta(id);
      if (!meta) throw new Error(`FRED series ${id} not found`);
      const url = q('series/observations', { series_id: id, observation_start: start });
      const { data, ms, calls } = await fetchJson<{ observations?: { date: string; value: string }[] }>(url, { label: 'FRED observations', fetchImpl, timeoutMs: 45000 });
      const raw = data.observations ?? [];
      const observations = raw.map((o) => {
        const v = o.value === '.' || o.value === '' ? null : Number(o.value);
        return { date: o.date, value: v !== null && Number.isFinite(v) ? v : null };
      });
      return {
        meta,
        observations,
        transformations: [],
        retrievedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
        calls: calls + 1,
        ms,
      };
    },
  };
}
