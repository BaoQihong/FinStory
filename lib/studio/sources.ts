// Research-source handling: authority classification, staleness, and
// deterministic verification that a quoted figure really appears in the
// retrieved text. A search result is never treated as verified on its own.

export type SourceType = 'primary' | 'journalism' | 'other';

/** Official publishers: central banks, statistical agencies, regulators, multilaterals. */
const PRIMARY_DOMAINS = [
  'federalreserve.gov', 'newyorkfed.org', 'stlouisfed.org', 'treasury.gov', 'bls.gov', 'bea.gov', 'census.gov', 'eia.gov',
  'sec.gov', 'cbo.gov', 'boj.or.jp', 'mof.go.jp', 'stat.go.jp', 'esri.cao.go.jp', 'meti.go.jp', 'ecb.europa.eu',
  'europa.eu', 'bankofengland.co.uk', 'ons.gov.uk', 'bankofcanada.ca', 'rba.gov.au', 'pbc.gov.cn', 'snb.ch',
  'imf.org', 'worldbank.org', 'bis.org', 'oecd.org', 'iea.org', 'opec.org', 'wto.org', 'un.org',
];
/** Established financial journalism (secondary reporting). */
const JOURNALISM_DOMAINS = [
  'reuters.com', 'apnews.com', 'ft.com', 'bloomberg.com', 'wsj.com', 'economist.com', 'nikkei.com', 'asia.nikkei.com',
  'cnbc.com', 'marketwatch.com', 'barrons.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'bbc.com',
  'bbc.co.uk', 'japantimes.co.jp', 'axios.com', 'fortune.com', 'forbes.com', 'businessinsider.com', 'morningstar.com',
  'spglobal.com', 'oilprice.com', 'argusmedia.com', 'kpler.com', 'investopedia.com', 'cnn.com', 'npr.org', 'politico.com',
];

export function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown';
  }
}

const matches = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

export function classifySource(url: string): SourceType {
  const host = publisherOf(url);
  if (matches(host, PRIMARY_DOMAINS) || /\.gov$|\.go\.jp$|\.gov\.[a-z]{2}$|\.int$/.test(host)) return 'primary';
  if (matches(host, JOURNALISM_DOMAINS)) return 'journalism';
  return 'other';
}

/** Parse a provider date ("2026-11-20", "Thu, 20 Nov 2026 10:00:00 GMT") to ISO yyyy-mm-dd, or null. */
export function isoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/** Older than `months` before `today` → stale. Undated sources are not stale, but reported as undated. */
export function isStale(published: string | null, today: string, months = 18): boolean {
  if (!published) return false;
  const [y, m] = today.split('-').map(Number);
  const cut = new Date(Date.UTC(y, m - 1 - months, 1)).toISOString().slice(0, 10);
  return published < cut;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** True when `quote` occurs (whitespace/quote-style-insensitively) in `haystack`. */
export function quoteAppears(quote: string, haystack: string): boolean {
  const q = norm(quote);
  return q.length >= 12 && norm(haystack).includes(q);
}

/** True when the figure text (e.g. "2.2 million") occurs inside the quote. */
export function figureInQuote(figure: string, quote: string): boolean {
  return norm(figure).length > 0 && norm(quote).includes(norm(figure));
}

/** Parse the leading number of a figure string ("2.2 million barrels" → 2.2, "$1,234" → 1234). */
export function leadingNumber(figure: string): number | null {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(figure);
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

/** Order sources: primary, then journalism, then other; within a class by provider score. */
export function rankSources<T extends { sourceType: SourceType; score: number | null }>(list: T[]): T[] {
  const w = { primary: 0, journalism: 1, other: 2 } as const;
  return [...list].sort((a, b) => w[a.sourceType] - w[b.sourceType] || (b.score ?? 0) - (a.score ?? 0));
}
