// Tiingo — end-of-day history for US-listed equities and ETFs. Uses the
// adjusted close (splits and dividends). Free tier is licensed for internal
// use only: fine for private drafts; review before public publishing (2C).
import { createHash } from 'node:crypto';
import { fetchJson, ProviderError, type FetchLike } from './http.ts';
import type { DataProvider, SeriesData, SeriesMeta } from './types.ts';

type TMeta = { ticker: string; name: string; description?: string; startDate: string; endDate: string; exchangeCode?: string };
type TPrice = { date: string; adjClose: number | null };

export function tiingoProvider(token: string | undefined, fetchImpl?: FetchLike): DataProvider {
  const H = { Authorization: `Token ${token ?? ''}`, 'Content-Type': 'application/json' };
  const sym = (id: string) => id.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  return {
    id: 'tiingo',
    name: 'Tiingo (end-of-day prices)',
    short: 'Tiingo',
    enabled: !!token,
    async meta(id) {
      try {
        const { data } = await fetchJson<TMeta>(`https://api.tiingo.com/tiingo/daily/${sym(id)}`, { headers: H, label: 'Tiingo meta', fetchImpl, retries: 1 });
        if (!data?.ticker) return null;
        return {
          provider: 'tiingo',
          id: data.ticker.toUpperCase(),
          title: `${data.name.trim()} (${data.ticker.toUpperCase()}) — adjusted closing price`,
          units: 'US Dollars per share (adjusted close)',
          frequency: 'Daily, trading days',
          seasonalAdjustment: null,
          observationStart: data.startDate,
          observationEnd: data.endDate,
          notes: (data.description ?? '').replace(/\s+/g, ' ').slice(0, 300),
          sourceUrl: `https://www.tiingo.com/${data.ticker.toLowerCase()}/overview`,
          popularity: null,
        } satisfies SeriesMeta;
      } catch (e) {
        // Not found → null. A service failure (timeout / 5xx / 429) is rethrown so callers can
        // tell an outage from a missing series (circuit breaker + evidence gaps).
        if (e instanceof ProviderError && e.retryable) throw e;
        return null;
      }
    },
    async fetch(id, start): Promise<SeriesData> {
      const meta = await this.meta(id);
      if (!meta) throw new Error(`Tiingo symbol ${id} not found`);
      const { data, ms, calls } = await fetchJson<TPrice[]>(
        `https://api.tiingo.com/tiingo/daily/${sym(id)}/prices?startDate=${start}&resampleFreq=daily`,
        { headers: H, label: 'Tiingo prices', fetchImpl, timeoutMs: 45000 },
      );
      const observations = data.map((p) => ({ date: p.date.slice(0, 10), value: typeof p.adjClose === 'number' && Number.isFinite(p.adjClose) ? Math.round(p.adjClose * 100) / 100 : null }));
      return {
        meta,
        observations,
        transformations: ['Adjusted closing price (Tiingo adjClose: adjusted for splits and dividends), rounded to cents.'],
        retrievedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
        calls: calls + 1,
        ms,
      };
    },
  };
}
