// US Energy Information Administration (EIA) Open Data API v2, via the
// series-id compatibility route (e.g. "PET.WCESTUS1.W"). Enabled only when
// EIA_API_KEY is configured; otherwise discovery reports the gap.
import { createHash } from 'node:crypto';
import { fetchJson, type FetchLike } from './http.ts';
import type { DataProvider, SeriesData, SeriesMeta } from './types.ts';

type EiaResp = {
  response?: {
    data?: { period: string; value: number | string | null; units?: string; 'series-description'?: string }[];
    frequency?: string;
    description?: string;
  };
};

const FREQ: Record<string, string> = { W: 'Weekly', M: 'Monthly', A: 'Annual', D: 'Daily', Q: 'Quarterly' };

function isoPeriod(p: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
  if (/^\d{4}$/.test(p)) return `${p}-01-01`;
  return p;
}

export function eiaProvider(apiKey: string | undefined, fetchImpl?: FetchLike): DataProvider {
  const url = (id: string, extra = '') => `https://api.eia.gov/v2/seriesid/${encodeURIComponent(id)}?api_key=${apiKey ?? ''}${extra}`;
  const freqOf = (id: string) => FREQ[id.split('.').at(-1) ?? ''] ?? 'Unknown';
  const p: DataProvider = {
    id: 'eia',
    name: 'US Energy Information Administration (EIA)',
    short: 'EIA',
    enabled: !!apiKey,
    async meta(id) {
      if (!apiKey) return null;
      try {
        const { data } = await fetchJson<EiaResp>(url(id, '&length=1&sort[0][column]=period&sort[0][direction]=desc'), { label: 'EIA meta', fetchImpl, retries: 1 });
        const row = data.response?.data?.[0];
        if (!row) return null;
        return {
          provider: 'eia',
          id,
          title: row['series-description'] ?? data.response?.description ?? id,
          units: row.units ?? 'Unknown units',
          frequency: freqOf(id),
          seasonalAdjustment: null,
          observationStart: '',
          observationEnd: isoPeriod(row.period),
          notes: (data.response?.description ?? '').slice(0, 300),
          sourceUrl: `https://www.eia.gov/opendata/browser/`,
          popularity: null,
        } satisfies SeriesMeta;
      } catch {
        return null;
      }
    },
    async fetch(id, start): Promise<SeriesData> {
      const meta = await p.meta(id);
      if (!meta) throw new Error(`EIA series ${id} not available`);
      const { data, ms, calls } = await fetchJson<EiaResp>(url(id, `&start=${start.slice(0, 7)}&length=5000&sort[0][column]=period&sort[0][direction]=asc`), {
        label: 'EIA data',
        fetchImpl,
        timeoutMs: 45000,
      });
      const rows = data.response?.data ?? [];
      const observations = rows
        .map((r) => ({ date: isoPeriod(r.period), value: r.value === null || r.value === '' ? null : Number(r.value) }))
        .map((o) => ({ ...o, value: o.value !== null && Number.isFinite(o.value) ? o.value : null }))
        .filter((o) => o.date >= start);
      return { meta, observations, transformations: [], retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), calls: calls + 1, ms };
    },
  };
  return p;
}
