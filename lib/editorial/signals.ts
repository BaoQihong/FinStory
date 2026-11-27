import { findFormulaicContrasts } from '../studio/numbers.ts';

// Prose diagnostics for the editorial evaluation (Phase 3B.2). These count a
// few habits the style guide discourages and measure rhythm and repetition.
// They are NOT a quality score and NOT an AI-detection score: a draft can
// score "well" and still be dull, or "badly" and be good. Human judgment
// decides; these only make before/after comparisons less impressionistic.

const STOCK = [
  /\bnavigat(?:e|es|ing)\b/gi,
  /\blandscape\b/gi,
  /\bdelve\b/gi,
  /\bvigilant\b/gi,
  /\bbalancing act\b/gi,
  /\binterplay\b/gi,
  /\bunderscore[sd]?\b/gi,
  /\bpivotal\b/gi,
  /\bknife'?s edge\b/gi,
  /\bperfect storm\b/gi,
  /\bonly time will tell\b/gi,
  /\bit(?:'s| is) worth noting\b/gi,
  /\bin conclusion\b/gi,
  /\bultimately,/gi,
  /\bimportantly,/gi,
  /\binflection point\b/gi,
  /\bheadwinds?\b/gi,
  /\brobust\b/gi,
  /\bkey (?:driver|factor|takeaway)s?\b/gi,
  /\bthe stakes\b/gi,
  /\b(?:ever-)?evolving\b/gi,
  /\binterconnected\b/gi,
  /\bfor (?:investors|households|readers), the (?:key|question|takeaway)\b/gi,
];
const CONTRAST = /\b(?:not (?:just|only|merely|simply)|isn't (?:just|only|merely|simply|about)|is not (?:just|only|merely|about)|it's not (?:just|only|about)|the (?:real )?(?:question|problem|issue|story) is(?:n't| not))\b/gi;
const TRIAD = /\b[\w'-]+(?: [\w'-]+){0,2}, [\w'-]+(?: [\w'-]+){0,2},? and [\w'-]+(?: [\w'-]+){0,2}\b/g;

const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z“"{(])/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
const words = (t: string) => t.split(/\s+/).filter(Boolean);
const cv = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  return m ? sd / m : 0;
};
const count = (t: string, re: RegExp) => (t.match(re) ?? []).length;

export type ProseSignals = {
  words: number;
  sentences: number;
  meanSentenceWords: number;
  /** Variation in sentence length (coefficient of variation): higher = less uniform rhythm. */
  sentenceLengthCV: number;
  /** Variation in paragraph length (words). */
  paragraphLengthCV: number;
  emDashesPer1000Words: number;
  formulaicContrasts: number;
  stockPhrases: number;
  stockPhraseList: string[];
  rhetoricalQuestions: number;
  tripletLists: number;
};

/** Signals over a list of paragraphs (tokens should already be resolved to numbers). */
export function proseSignals(paragraphs: string[]): ProseSignals {
  const text = paragraphs.join('\n\n');
  const w = words(text).length || 1;
  const sents = paragraphs.flatMap(sentences);
  const stock: string[] = [];
  for (const re of STOCK) for (const m of text.match(re) ?? []) stock.push(m.toLowerCase());
  return {
    words: w,
    sentences: sents.length,
    meanSentenceWords: +(sents.reduce((a, s) => a + words(s).length, 0) / (sents.length || 1)).toFixed(1),
    sentenceLengthCV: +cv(sents.map((s) => words(s).length)).toFixed(2),
    paragraphLengthCV: +cv(paragraphs.map((p) => words(p).length)).toFixed(2),
    emDashesPer1000Words: +((count(text, /—/g) / w) * 1000).toFixed(1),
    formulaicContrasts: Math.max(count(text, CONTRAST), findFormulaicContrasts(text).length),
    stockPhrases: stock.length,
    stockPhraseList: [...new Set(stock)],
    rhetoricalQuestions: sents.filter((s) => s.endsWith('?')).length,
    tripletLists: count(text, TRIAD),
  };
}

const STOP = new Set('the a an of to in and or for on at by with from as is are was were be been that this these those it its their there which who what when while but than then so not no has have had will would could may might can over into after before about more most less same such also only just its'.split(' '));
const grams = (t: string, n = 4) => {
  const ws = t.toLowerCase().replace(/[^a-z0-9{}\s]/g, ' ').split(/\s+/).filter((x) => x && !STOP.has(x));
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
};

/** Share of content-word 4-grams in `later` that already appeared in `earlier` (0–1): a rough repetition measure. */
export function repetitionShare(earlier: string, later: string): number {
  const a = grams(earlier);
  const b = grams(later);
  if (!b.size) return 0;
  let hit = 0;
  for (const g of b) if (a.has(g)) hit++;
  return +(hit / b.size).toFixed(3);
}

/** Fact tokens that appear in more than one section (the same figure restated). */
export function tokensRestated(sections: Record<string, string>): string[] {
  const seen = new Map<string, Set<string>>();
  for (const [sec, text] of Object.entries(sections)) for (const m of text.matchAll(/\{([a-zA-Z0-9]+)(?:\.date)?(?::\w+)?\}/g)) (seen.get(m[1]) ?? seen.set(m[1], new Set()).get(m[1])!).add(sec);
  return [...seen].filter(([, s]) => s.size > 1).map(([k]) => k);
}

/** Stock phrases from the style guide's "avoid" list found in one passage (for Polish hints). */
export function stockPhrasesIn(text: string): string[] {
  const out = new Set<string>();
  for (const re of STOCK) for (const m of text.match(re) ?? []) out.add(m.toLowerCase());
  return [...out];
}
