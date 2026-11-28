// FRED (Federal Reserve Bank of St. Louis) — series search, metadata and
// observations through the official API. Missing values (".") become null.
import { createHash } from 'node:crypto';
import { fetchJson, ProviderError, type FetchLike } from './http.ts';
import { sharedFredLimiter, type FredLimiter } from './fred-limiter.ts';
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

/** FRED answers an unknown series id with HTTP 400 "The series does not exist" (or 404). Only that means "not found". */
export const isMissingSeries = (e: unknown) =>
  e instanceof ProviderError && (e.status === 404 || (e.status === 400 && /does not exist/i.test(e.message)));

// Every request goes through the shared limiter (one at a time, ≤ 60/min, 429 backoff, 403 circuit breaker).
export function fredProvider(apiKey: string | undefined, fetchImpl?: FetchLike, limiter: FredLimiter = sharedFredLimiter): DataProvider {
  const base: FetchLike = fetchImpl ?? ((input, init) => fetch(input, init));
  const via = (endpoint: string) => limiter.fetchFor(endpoint, base);
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
  // P3D1a-15: transient, in-memory de-duplication of metadata lookups within one pipeline stage.
  // Identical lookups (concurrent or repeated) share one request, and series returned by a search
  // are not looked up again. Failures are never remembered, so retries and the breaker behave as
  // before. Cleared by beginStage() (the runner calls it before every stage); never persisted.
  let lookups = new Map<string, Promise<SeriesMeta | null>>();
  const remember = (m: SeriesMeta) => {
    if (!lookups.has(m.id)) lookups.set(m.id, Promise.resolve(m));
  };
  const lookup = async (id: string): Promise<SeriesMeta | null> => {
    try {
      const { data } = await fetchJson<{ seriess?: FredSeries[] }>(q('series', { series_id: id }), { label: 'FRED series', fetchImpl: via('series'), retries: 1 });
      return data.seriess?.[0] ? toMeta(data.seriess[0]) : null;
    } catch (e) {
      // Only a genuine unknown-series answer is "not found". Everything else (timeout, 5xx, 429,
      // and access denied 401/403) is rethrown so callers report an outage, not a missing series.
      if (isMissingSeries(e)) return null;
      throw e;
    }
  };
  /** The SeriesMeta fields only (callers may pass a richer candidate object). */
  const metaOnly = (m: SeriesMeta): SeriesMeta => ({
    provider: m.provider,
    id: m.id,
    title: m.title,
    units: m.units,
    frequency: m.frequency,
    seasonalAdjustment: m.seasonalAdjustment,
    observationStart: m.observationStart,
    observationEnd: m.observationEnd,
    notes: m.notes,
    sourceUrl: m.sourceUrl,
    popularity: m.popularity,
  });
  return {
    id: 'fred',
    name: 'FRED, Federal Reserve Bank of St. Louis',
    short: 'FRED',
    enabled: !!apiKey,
    takeRequestStats: () => limiter.takeStats(),
    beginStage: () => {
      lookups = new Map();
    },
    async search(text, limit) {
      const { data } = await fetchJson<{ seriess?: FredSeries[] }>(
        q('series/search', { search_text: text, limit: String(limit), order_by: 'popularity', sort_order: 'desc' }),
        { label: 'FRED search', fetchImpl: via('series/search') },
      );
      const found = (data.seriess ?? []).map(toMeta);
      found.forEach(remember);
      return found;
    },
    meta(id) {
      const seen = lookups.get(id);
      if (seen) {
        limiter.note('metaReused');
        return seen;
      }
      const p = lookup(id);
      lookups.set(id, p);
      p.catch(() => lookups.get(id) === p && lookups.delete(id));
      return p;
    },
    async fetch(id, start, known): Promise<SeriesData> {
      const reuse = known && known.provider === 'fred' && known.id === id;
      if (reuse) limiter.note('metaKnown');
      const meta = reuse ? metaOnly(known) : await this.meta(id);
      if (!meta) throw new Error(`FRED series ${id} not found`);
      const url = q('series/observations', { series_id: id, observation_start: start });
      const { data, ms, calls } = await fetchJson<{ observations?: { date: string; value: string }[] }>(url, { label: 'FRED observations', fetchImpl: via('series/observations'), timeoutMs: 45000 });
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
        calls: calls + (reuse ? 0 : 1),
        ms,
      };
    },
  };
}
