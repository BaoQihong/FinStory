// US Energy Information Administration (EIA) Open Data API v2. Two id forms:
//
//   Legacy series id (petroleum works reliably):   "PET.WCESTUS1.W"
//     → /v2/seriesid/<id>
//   Native v2 route (electricity, generation):      "v2:<route>|<data column>|<facet>=<v>,…|<frequency>"
//     e.g. "v2:electricity/retail-sales|sales|stateid=US,sectorid=ALL|monthly"
//     → /v2/<route>/data/?data[0]=<col>&facets[..][]=..&frequency=..
//
// Enabled only when EIA_API_KEY is configured. EIA's electricity endpoints
// can be slow (20–45 s observed), so timeouts are generous and the pipeline
// fetches datasets in parallel.
import { createHash } from 'node:crypto';
import { fetchJson, ProviderError, type FetchLike } from './http.ts';
import type { DataProvider, SeriesData, SeriesMeta } from './types.ts';

type Row = Record<string, string | number | null> & { period: string };
type EiaResp = { response?: { data?: Row[]; frequency?: string; description?: string } };

const FREQ: Record<string, string> = { W: 'Weekly', M: 'Monthly', A: 'Annual', D: 'Daily', Q: 'Quarterly', weekly: 'Weekly', monthly: 'Monthly', annual: 'Annual', quarterly: 'Quarterly', daily: 'Daily' };

function isoPeriod(p: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
  if (/^\d{4}-Q([1-4])$/.test(p)) return `${p.slice(0, 4)}-${String((Number(p.slice(-1)) - 1) * 3 + 1).padStart(2, '0')}-01`;
  if (/^\d{4}$/.test(p)) return `${p}-01-01`;
  return p;
}

type Native = { route: string; col: string; facets: [string, string][]; frequency: string };
export function parseNativeId(id: string): Native | null {
  if (!id.startsWith('v2:')) return null;
  const [route, col, facets, frequency] = id.slice(3).split('|');
  if (!route || !col || !frequency || !/^[a-z0-9\-/]+$/i.test(route)) return null;
  return {
    route,
    col,
    facets: (facets ?? '').split(',').filter(Boolean).map((f) => f.split('=') as [string, string]),
    frequency,
  };
}

export function eiaProvider(apiKey: string | undefined, fetchImpl?: FetchLike): DataProvider {
  const legacyUrl = (id: string, extra: string) => `https://api.eia.gov/v2/seriesid/${encodeURIComponent(id)}?api_key=${apiKey ?? ''}${extra}`;
  const nativeUrl = (n: Native, extra: string) => {
    const q = new URLSearchParams({ api_key: apiKey ?? '', frequency: n.frequency, 'data[0]': n.col });
    for (const [k, v] of n.facets) q.append(`facets[${k}][]`, v);
    return `https://api.eia.gov/v2/${n.route}/data/?${q}${extra}`;
  };
  const url = (id: string, extra: string) => {
    const n = parseNativeId(id);
    return n ? nativeUrl(n, extra) : legacyUrl(id, extra);
  };
  const describe = (id: string, row: Row, resp: EiaResp): Pick<SeriesMeta, 'title' | 'units' | 'frequency' | 'sourceUrl'> => {
    const n = parseNativeId(id);
    if (!n) {
      return {
        title: String(row['series-description'] ?? resp.response?.description ?? id),
        units: String(row.units ?? 'Unknown units'),
        frequency: FREQ[id.split('.').at(-1) ?? ''] ?? 'Unknown',
        sourceUrl: 'https://www.eia.gov/opendata/browser/',
      };
    }
    const facetText = Object.entries(row)
      .filter(([k]) => /Description$|Name$/.test(k))
      .map(([, v]) => v)
      .join(', ');
    return {
      title: `${n.route.split('/').at(-1)!.replace(/-/g, ' ')}: ${n.col} — ${facetText}`,
      units: String(row[`${n.col}-units`] ?? 'Unknown units'),
      frequency: FREQ[n.frequency] ?? n.frequency,
      sourceUrl: `https://www.eia.gov/opendata/browser/${n.route}`,
    };
  };
  const valueOf = (id: string, r: Row) => {
    const n = parseNativeId(id);
    const raw = n ? r[n.col] : r.value;
    if (raw === null || raw === undefined || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const sort = '&sort[0][column]=period&sort[0][direction]=desc';

  const p: DataProvider = {
    id: 'eia',
    name: 'US Energy Information Administration (EIA)',
    short: 'EIA',
    enabled: !!apiKey,
    async meta(id) {
      if (!apiKey) return null;
      try {
        const { data } = await fetchJson<EiaResp>(url(id, `&length=1${sort}`), { label: 'EIA meta', fetchImpl, retries: 1, timeoutMs: parseNativeId(id) ? 20_000 : 40_000 });
        const row = data.response?.data?.[0];
        if (!row) return null;
        return { provider: 'eia', id, ...describe(id, row, data), seasonalAdjustment: null, observationStart: '', observationEnd: isoPeriod(row.period), notes: (data.response?.description ?? '').slice(0, 300), popularity: null } satisfies SeriesMeta;
      } catch (e) {
        // Not found → null. A service failure (timeout / 5xx / 429) is rethrown so callers can
        // tell an outage from a missing series (circuit breaker + evidence gaps).
        if (e instanceof ProviderError && e.retryable) throw e;
        return null;
      }
    },
    async fetch(id, start): Promise<SeriesData> {
      if (!apiKey) throw new Error('EIA_API_KEY not configured');
      const { data, ms, calls } = await fetchJson<EiaResp>(url(id, `&start=${start.slice(0, 7)}&length=5000${sort}`), { label: 'EIA data', fetchImpl, timeoutMs: 60_000, retries: 1 });
      const rows = (data.response?.data ?? []).slice().reverse();
      if (!rows.length) throw new Error(`EIA series ${id} returned no data`);
      const meta: SeriesMeta = {
        provider: 'eia',
        id,
        ...describe(id, rows[rows.length - 1], data),
        seasonalAdjustment: null,
        observationStart: isoPeriod(rows[0].period),
        observationEnd: isoPeriod(rows[rows.length - 1].period),
        notes: (data.response?.description ?? '').slice(0, 300),
        popularity: null,
      };
      const observations = rows.map((r) => ({ date: isoPeriod(r.period), value: valueOf(id, r) })).filter((o) => o.date >= start);
      return { meta, observations, transformations: [], retrievedAt: new Date().toISOString(), sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), calls, ms };
    },
  };
  return p;
}
