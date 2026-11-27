// Retrieve historical observations from FRED (Federal Reserve Bank of St. Louis)
// and store them as version-controlled JSON fixtures in data/fred/.
//
// Uses FRED's public CSV download endpoint (no API key required):
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>
//
// Usage (from repo root):  node scripts/data/fetch-fred.mjs
//
// Phase 2A: run manually; output is committed. Phase 3 replaces this with
// automated retrieval. Missing observations (FRED writes an empty cell or ".")
// are preserved as `null` — never interpolated or filled.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'data', 'fred');
const WINDOW_START = '2000-01-01'; // covers "highest since …" lookbacks; charts start later

// Metadata transcribed from each series' FRED page (https://fred.stlouisfed.org/series/<ID>).
const SERIES = [
  {
    id: 'DGS10',
    name: '10-Year Treasury Constant Maturity Rate',
    shortName: 'US 10-year Treasury yield',
    description:
      'Market yield on US Treasury securities at 10-year constant maturity, quoted on an investment basis. Source data from the Board of Governors of the Federal Reserve System (H.15).',
    units: 'Percent',
    frequency: 'Daily',
    seasonalAdjustment: 'Not Seasonally Adjusted',
  },
  {
    id: 'DFII10',
    name: 'Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity, Quoted on an Investment Basis, Inflation-Indexed',
    shortName: 'US 10-year real Treasury yield (TIPS)',
    description:
      'Yield on 10-year Treasury Inflation-Protected Securities (TIPS) — the return investors require above inflation. Board of Governors of the Federal Reserve System (H.15).',
    units: 'Percent',
    frequency: 'Daily',
    seasonalAdjustment: 'Not Seasonally Adjusted',
  },
  {
    id: 'DFF',
    name: 'Federal Funds Effective Rate',
    shortName: 'Effective federal funds rate',
    description:
      'Volume-weighted median overnight rate on federal funds transactions, published by the Federal Reserve Bank of New York. FRED reports a value for every calendar day (weekend and holiday values carry the preceding business day).',
    units: 'Percent',
    frequency: 'Daily, 7-Day',
    seasonalAdjustment: 'Not Seasonally Adjusted',
  },
  {
    id: 'CPILFESL',
    name: 'Consumer Price Index for All Urban Consumers: All Items Less Food and Energy in U.S. City Average',
    shortName: 'US core CPI (index)',
    description:
      'Core consumer price index (excludes food and energy), US Bureau of Labor Statistics. This is an index level, not a rate — inflation rates must be calculated from it.',
    units: 'Index 1982-1984=100',
    frequency: 'Monthly',
    seasonalAdjustment: 'Seasonally Adjusted',
  },
  {
    id: 'A191RL1Q225SBEA',
    name: 'Real Gross Domestic Product',
    shortName: 'US real GDP growth',
    description:
      'Percent change in real GDP from the preceding quarter, expressed at a seasonally adjusted annual rate. US Bureau of Economic Analysis.',
    units: 'Percent Change from Preceding Period, Seasonally Adjusted Annual Rate',
    frequency: 'Quarterly',
    seasonalAdjustment: 'Seasonally Adjusted Annual Rate',
  },
];

async function fetchSeries(meta) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${meta.id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${meta.id}: HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  if (header[0] !== 'observation_date' || header[1] !== meta.id) {
    throw new Error(`${meta.id}: unexpected CSV header "${lines[0]}"`);
  }
  const observations = [];
  let missing = 0;
  for (const line of lines.slice(1)) {
    const [date, raw] = line.split(',');
    if (date < WINDOW_START) continue;
    const value = raw === '' || raw === '.' || raw === undefined ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) throw new Error(`${meta.id}: bad value "${raw}" on ${date}`);
    if (value === null) missing++;
    observations.push({ date, value });
  }
  const sha256 = createHash('sha256').update(csv).digest('hex');
  return { csvUrl: url, sha256, observations, missing };
}

mkdirSync(OUT_DIR, { recursive: true });
const retrievedAt = new Date().toISOString();

for (const meta of SERIES) {
  const { csvUrl, sha256, observations, missing } = await fetchSeries(meta);
  const fixture = {
    schemaVersion: 1,
    source: {
      provider: 'Federal Reserve Economic Data (FRED), Federal Reserve Bank of St. Louis',
      seriesUrl: `https://fred.stlouisfed.org/series/${meta.id}`,
      downloadUrl: csvUrl,
      downloadSha256: sha256,
    },
    seriesId: meta.id,
    name: meta.name,
    shortName: meta.shortName,
    description: meta.description,
    units: meta.units,
    frequency: meta.frequency,
    seasonalAdjustment: meta.seasonalAdjustment,
    retrievedAt,
    window: {
      start: observations[0].date,
      end: observations[observations.length - 1].date,
    },
    transformations: [
      `Filtered to observations dated on or after ${WINDOW_START}. Values stored exactly as published.`,
      'Missing observations (empty or "." in the FRED CSV) are stored as null; they are never interpolated.',
    ],
    observations,
  };
  // One observation per line keeps diffs readable when fixtures are refreshed.
  const { observations: obs, ...head } = fixture;
  const body = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const rows = obs.map((o) => '    ' + JSON.stringify(o)).join(',\n');
  writeFileSync(join(OUT_DIR, `${meta.id}.json`), `${body},\n  "observations": [\n${rows}\n  ]\n}\n`);
  console.log(
    `${meta.id.padEnd(16)} ${observations.length} obs  ${fixture.window.start} → ${fixture.window.end}  missing=${missing}`,
  );
}
console.log(`Retrieved ${retrievedAt}`);
