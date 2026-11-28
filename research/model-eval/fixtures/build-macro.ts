// Freeze the US macro dataset used by benchmark tests A–D (run once; output is
// committed and never refreshed per model). Source: FRED API (FRED_API_KEY in
// .env.local; the key is never printed or stored). Missing observations stay
// null (D-018). Monthly aggregation is done by FRED (avg, or end-of-period for
// the S&P 500), not by us.
//
//   node research/model-eval/fixtures/build-macro.ts
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fredKey } from '../lib/env.ts';

const START = '2016-11-01';
const SERIES: { id: string; key: string; label: string; units: string; agg?: 'avg' | 'eop'; note?: string }[] = [
  { id: 'CPIAUCSL', key: 'cpi', label: 'CPI, all items (SA)', units: 'index 1982-84=100' },
  { id: 'CPILFESL', key: 'coreCpi', label: 'Core CPI, ex food & energy (SA)', units: 'index 1982-84=100' },
  { id: 'CES0500000003', key: 'ahe', label: 'Average hourly earnings, all private employees (SA)', units: 'US$ per hour' },
  { id: 'FEDFUNDS', key: 'fedFunds', label: 'Effective federal funds rate (monthly average)', units: '%' },
  { id: 'MORTGAGE30US', key: 'mortgage30', label: '30-year fixed mortgage rate, Freddie Mac PMMS (monthly average of weekly)', units: '%', agg: 'avg' },
  { id: 'DGS10', key: 'ust10', label: '10-year Treasury yield (monthly average of daily)', units: '%', agg: 'avg' },
  { id: 'DGS2', key: 'ust2', label: '2-year Treasury yield (monthly average of daily)', units: '%', agg: 'avg' },
  { id: 'PCEC96', key: 'realPce', label: 'Real personal consumption expenditures (SAAR)', units: 'bn chained 2017 US$' },
  { id: 'UNRATE', key: 'unemployment', label: 'Unemployment rate (SA)', units: '%' },
  { id: 'PAYEMS', key: 'payrolls', label: 'Nonfarm payrolls (SA)', units: 'thousands of persons' },
  { id: 'UMCSENT', key: 'sentiment', label: 'University of Michigan consumer sentiment', units: 'index 1966Q1=100', note: 'Copyrighted third-party series (D-051); research use only, not for publication.' },
  { id: 'PSAVERT', key: 'savingRate', label: 'Personal saving rate', units: '% of disposable income' },
  { id: 'SP500', key: 'sp500', label: 'S&P 500 index (month-end close)', units: 'index level', agg: 'eop', note: 'S&P Dow Jones Indices via FRED; FRED holds roughly ten years only.' },
];

const key = fredKey();
if (!key) throw new Error('FRED_API_KEY missing in .env.local');

const out: Record<string, unknown> = {
  fixture: 'macro-us',
  version: 'v1',
  source: 'Federal Reserve Economic Data (FRED), Federal Reserve Bank of St. Louis — API series/observations',
  retrievedAt: new Date().toISOString(),
  window: { start: START },
  rules: 'Values exactly as returned by FRED (frequency=m). Missing values are null, never filled.',
  series: {},
};
for (const s of SERIES) {
  const url = new URL('https://api.stlouisfed.org/fred/series/observations');
  url.search = new URLSearchParams({ series_id: s.id, api_key: key, file_type: 'json', observation_start: START, frequency: 'm', ...(s.agg ? { aggregation_method: s.agg } : {}) }).toString();
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`FRED ${s.id}: HTTP ${res.status}`);
  const j = JSON.parse(text) as { observations: { date: string; value: string }[] };
  const obs = j.observations.map((o) => ({ date: o.date.slice(0, 7), value: o.value === '.' || o.value === '' ? null : Number(o.value) }));
  (out.series as Record<string, unknown>)[s.key] = {
    fredId: s.id,
    label: s.label,
    units: s.units,
    aggregation: s.agg ?? 'native monthly',
    note: s.note,
    seriesUrl: `https://fred.stlouisfed.org/series/${s.id}`,
    responseSha256: createHash('sha256').update(text).digest('hex'),
    observations: obs,
  };
  console.log(`${s.id}: ${obs.length} obs, ${obs[0]?.date} → ${obs.at(-1)?.date}, nulls ${obs.filter((o) => o.value === null).length}`);
}
const file = join(import.meta.dirname, 'v1', 'macro-us.json');
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`→ ${file}`);
