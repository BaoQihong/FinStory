// Number discipline for generated (and edited) copy — D-017 applied to drafts.
//
// Every financial figure in prose must be a fact token ({key}) resolved from
// deterministic data. This module finds (1) tokens that do not resolve and
// (2) "bare" numeric claims typed directly into text. Years ("2008"),
// decades ("1990s"), maturities ("10-year") and names ("S&P 500", "G7") are
// allowed; percentages, decimals, currency amounts, quantities with units
// and spelled-out rate changes are not.
const TOKEN = /\{([a-zA-Z0-9]+)(?:\.(date))?(?::(short|abs))?\}/g;

export type TokenProblem = { token: string; reason: string };

export function checkTokens(text: string, facts: Record<string, unknown>, dates: Record<string, unknown>): TokenProblem[] {
  const out: TokenProblem[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const [whole, key, date, short] = m;
    if (key in facts) {
      if (date && !(facts[key] as { date?: string }).date) out.push({ token: whole, reason: 'fact has no date' });
      continue;
    }
    if (key in dates && !date && !short) continue;
    out.push({ token: whole, reason: 'unknown fact key' });
  }
  return out;
}

const WORD_NUM = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|half|a quarter|a third)';
const UNIT = '(?:%|per ?cent|percentage points?|pp|basis points?|bps?|bp|million|billion|trillion|bn|mn|barrels?|bpd|b\\/d|tonnes?|ounces?|yen|dollars?|euros?|pounds?|times|fold|x\\b)';

const PATTERNS: { re: RegExp; why: string }[] = [
  { re: /[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion|trillion))?/gi, why: 'currency amount' },
  { re: new RegExp(`\\b\\d[\\d,]*(?:\\.\\d+)?\\s?${UNIT}`, 'gi'), why: 'number with a unit' },
  { re: new RegExp(`\\b${WORD_NUM}(?:[- ]${WORD_NUM})?\\s+(?:percentage points?|per ?cent|basis points?|million barrels|billion)`, 'gi'), why: 'spelled-out figure' },
  { re: /\b\d+\.\d+\b/g, why: 'decimal number' },
  { re: /\b\d{1,3}(?:,\d{3})+\b/g, why: 'large number' },
];

/** Allowed digit uses that are not data claims. */
const ALLOWED = [
  /^(?:1[89]|20|21)\d{2}s?$/, // years and decades
  /^\d{1,2}-(?:year|month|week|day)$/i,
];

export type BareNumber = { match: string; why: string };

export function findBareNumbers(text: string): BareNumber[] {
  const stripped = text.replace(TOKEN, ' ');
  const found: BareNumber[] = [];
  const seen = new Set<string>();
  for (const { re, why } of PATTERNS) {
    for (const m of stripped.matchAll(re)) {
      const s = m[0].trim();
      if (ALLOWED.some((a) => a.test(s))) continue;
      // A year followed by a unit word that is really a name ("2008 dollars" is still flagged; "S&P 500" isn't matched).
      if (seen.has(s)) continue;
      seen.add(s);
      found.push({ match: s, why });
    }
  }
  return found;
}

// Superlatives and comparisons that need a data fact behind them in the same sentence.
// Only data-claim superlatives: "highest level/since/in…", "X-year high", "record", "all-time",
// "largest increase/drop…" and comparisons with an average. Descriptive uses such as
// "the largest economy" or "the biggest risk" are not flagged (fewer false positives).
const SUPERLATIVE = /\b(record[- ](?:high|low)s?|all-time|(?:\w+-)?(?:year|month|decade)[- ](?:high|low)s?|(?:highest|lowest|strongest|weakest)(?=\s+(?:level|reading|value|rate|price|point|close|since|in|on record|of|for|ever|yet))|(?:biggest|largest|smallest|steepest|sharpest)\s+(?:increase|rise|gain|jump|drop|decline|fall|move|rally|selloff|sell-off|annual|monthly|weekly|daily|one-day|quarterly)|(?:above|below) (?:its|the) (?:\w+[- ])?(?:year )?average)\b/i;
const EXTREME_TOKEN = /\{[a-zA-Z0-9]*(?:High|Low)(?:1y|5y|All)(?:\.date)?(?::(?:short|abs))?\}|\{[a-zA-Z0-9]*(?:HighestSince|LowestSince)\}/;

/** Sentences making a superlative/average claim without an extreme-value fact token in the same sentence. */
export function findUnsupportedSuperlatives(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => SUPERLATIVE.test(s) && (!EXTREME_TOKEN.test(s) || /\b(all-time|record)\b/i.test(s)))
    .map((s) => (SUPERLATIVE.exec(s)?.[0] ?? '').toLowerCase());
}

type Ext = { value: number; date?: string };
/**
 * Superlatives verified against the data instead of merely pattern-matched:
 *  - backed by an extreme/"since" token → supported (as before);
 *  - "highest … since {xHistoryStart}" → TRUE only if xLatest equals xHighAll (lowest: xLowAll);
 *    false ones are reported as contradicting the data;
 *  - otherwise → unsupported.
 */
export function classifySuperlatives(text: string, facts: Record<string, Ext>): { word: string; verdict: 'unsupported' | 'contradicted' }[] {
  const out: { word: string; verdict: 'unsupported' | 'contradicted' }[] = [];
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    const m = SUPERLATIVE.exec(s);
    if (!m) continue;
    const word = m[0].toLowerCase();
    if (/\b(all-time|record)\b/i.test(s)) {
      out.push({ word, verdict: 'unsupported' });
      continue;
    }
    if (EXTREME_TOKEN.test(s)) continue;
    const hs = /\{([a-zA-Z0-9]+)HistoryStart\}/.exec(s);
    if (hs) {
      const low = /\b(lowest|weakest|smallest|low)\b/i.test(word);
      const latest = facts[`${hs[1]}Latest`];
      const ext = facts[`${hs[1]}${low ? 'LowAll' : 'HighAll'}`];
      if (latest && ext && latest.value === ext.value && latest.date === ext.date) continue; // verified true
      out.push({ word, verdict: latest && ext ? 'contradicted' : 'unsupported' });
      continue;
    }
    out.push({ word, verdict: 'unsupported' });
  }
  return out;
}

/** Immediately repeated words ("over over"), as the reader would see them. */
const OK_REPEATS = new Set(['that', 'had', 'is', 'do']);
export function findDuplicateWords(resolvedText: string): string[] {
  return [...resolvedText.matchAll(/\b([A-Za-z]+)\s+\1\b/gi)].map((m) => m[1].toLowerCase()).filter((w) => !OK_REPEATS.has(w));
}

const CLICHES = /\b(navigat(?:e|ing|es)|delve|landscape|rollercoaster|in today's|fast-paced|game[- ]changer|perfect storm|tip of the iceberg|only time will tell|buckle up|it remains to be seen|in conclusion|ultimately,)/i;
export function findCliches(text: string): string[] {
  const m = CLICHES.exec(text);
  return m ? [m[0]] : [];
}

/** Walk any JSON value and yield [path, string] for each string leaf. */
export function* stringLeaves(v: unknown, path = ''): Generator<[string, string]> {
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* stringLeaves(x, `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* stringLeaves(x, path ? `${path}.${k}` : k);
}
