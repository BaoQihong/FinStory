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
  // Multiples are figures too (Phase 3B.2 evaluation: "rates have quadrupled" for 3.10% → 7.21%).
  { re: /\b(?:doubled|tripled|quadrupled|halved|(?:more than |nearly |almost |roughly )?(?:twice|double|triple|three times|four times|tenfold|ten times)(?= (?:as|the|what|that|higher|larger|more|bigger|faster)))\b/gi, why: 'multiple stated without a fact token' },
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

// Formulaic contrast (Phase 3B.2 style guide): "X is not just A; it is B", "This isn't about A — it's B",
// "not merely A, but B", "the question is no longer whether…". Sentence-local; reported as a style note
// that the repair stage reworks (no extra calls). A single honest contrast is fine; the habit is the problem.
const CONTRASTS = [
  /\b(?:is|are|was|were)\s+not\s+(?:just\s+|only\s+|merely\s+|simply\s+|about\s+)?[^.;:—!?]{0,70}[;:—]\s*(?:it|they|this|that)(?:'s|\s+is|\s+are|\s+was)\b/gi,
  /\b(?:isn't|aren't|wasn't|weren't)\s+(?:just\s+|only\s+|merely\s+|simply\s+|about\s+)?[^.;:—!?]{0,70}[;:—]\s*(?:it|they|this|that)(?:'s|\s+is|\s+are|\s+was)\b/gi,
  /\bnot\s+(?:just|only|merely|simply)\s+[^.;:!?]{1,70},\s+but\b/gi,
  /\b(?:isn't|is\s+not)\s+that\b[^.;:!?]{1,70},\s+but\b/gi,
  /\bthe\s+(?:real\s+)?(?:question|issue|problem|point|story)\s+is\s+no\s+longer\s+whether\b/gi,
  /\bthe\s+(?:real\s+)?(?:question|issue|problem|point|story)\s+(?:isn't|is\s+not)\b[^.;!?]{0,70}[;,—]\s*(?:it's|it\s+is|but)\b/gi,
];
export function findFormulaicContrasts(text: string): string[] {
  const out: string[] = [];
  for (const re of CONTRASTS) for (const m of text.matchAll(re)) out.push(m[0].slice(0, 80));
  return out;
}

/** Walk any JSON value and yield [path, string] for each string leaf. */
export function* stringLeaves(v: unknown, path = ''): Generator<[string, string]> {
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* stringLeaves(x, `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* stringLeaves(x, path ? `${path}.${k}` : k);
}

// Verbatim reuse across sections (Phase 3B.2 evaluation: Macro/Analytics copied Story sentences when
// given the full Story text). Reports the first shared run of REUSE_WORDS consecutive words per sentence.
const REUSE_WORDS = 9;
const normWords = (t: string) => t.toLowerCase().replace(/[^a-z0-9{}.:'\s-]/g, ' ').split(/\s+/).filter(Boolean);
export function findReusedWording(earlierTexts: string[], text: string): string[] {
  const seen = new Set<string>();
  for (const e of earlierTexts) {
    const w = normWords(e);
    for (let i = 0; i + REUSE_WORDS <= w.length; i++) seen.add(w.slice(i, i + REUSE_WORDS).join(' '));
  }
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const w = normWords(sentence);
    for (let i = 0; i + REUSE_WORDS <= w.length; i++) {
      const g = w.slice(i, i + REUSE_WORDS).join(' ');
      if (seen.has(g)) {
        out.push(g.slice(0, 90));
        break;
      }
    }
  }
  return out;
}
