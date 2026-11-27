// Verify every curated registry id against its provider (FRED / Tiingo metadata endpoints).
// Usage: node scripts/studio/check-registry.mjs   (reads keys from .env.local; never prints them)
import { readFileSync } from 'node:fs';
import { readEnv } from '../lib/env-file.mjs';
const env = readEnv();
const src = readFileSync(new URL('../../lib/studio/registry.ts', import.meta.url), 'utf8');
const entries = [...src.matchAll(/^\s*(fred|tiingo)\('([^']+)'/gm)].map((m) => ({ provider: m[1], id: m[2] }));
let bad = 0;
for (const e of entries) {
  let ok, info;
  if (e.provider === 'eia') {
    if (!env.EIA_API_KEY) { console.log(`skip eia:${e.id} — EIA_API_KEY not configured`); continue; }
    const r = await fetch(`https://api.eia.gov/v2/seriesid/${e.id}?api_key=${env.EIA_API_KEY}&length=1`);
    ok = r.ok; info = `HTTP ${r.status}`;
  } else if (e.provider === 'fred') {
    const r = await fetch(`https://api.stlouisfed.org/fred/series?series_id=${e.id}&api_key=${env.FRED_API_KEY}&file_type=json`);
    const j = await r.json(); const s = j.seriess?.[0];
    ok = r.ok && !!s; info = s ? `${s.frequency_short} ${s.units_short} last ${s.observation_end}` : `HTTP ${r.status}`;
    if (s && s.observation_end < '2025-06-01') { ok = false; info += ' (STALE)'; }
  } else {
    const r = await fetch(`https://api.tiingo.com/tiingo/daily/${e.id}?token=${env.TIINGO_API_KEY}`);
    const j = await r.json().catch(() => ({})); ok = r.ok && !!j.ticker; info = ok ? `${j.name} → ${j.endDate}` : `HTTP ${r.status}`;
  }
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${e.provider}:${e.id} — ${info}`);
}
console.log(`\n${entries.length - bad}/${entries.length} valid`);
process.exit(bad ? 1 : 0);
