// Test E (editorial writing). Every model gets the same verified research
// material and the same completed analytical brief, so differences are about
// writing, not research. The brief was written for this benchmark by Claude
// Code from the frozen data (not by any candidate model, to avoid favouring
// the model that drafted it). Instructions = Seshat's real style guide.
import { STYLE_GUIDE, STYLE_GUIDE_VERSION } from '../../../lib/editorial/style-guide.ts';
import { proseSignals } from '../../../lib/editorial/signals.ts';
import type { CallResult } from '../lib/arli.ts';
import type { Case, Check } from '../lib/types.ts';
import { at, loadMacro, r1, yoy } from '../fixtures/stats.ts';
import { probabilityLanguage } from './analysis.ts';

export const WRITING_VERSION = 'writing-v1';
const M = loadMacro();
const S = M.series;
const pct = (v: number) => `${r1(v).toFixed(1)}%`;

/** The fact sheet: every figure the article may use, computed from the fixture. */
export const FACTS_HOUSEHOLDS: { key: string; text: string; what: string }[] = [
  { key: 'cpiSep26', text: pct(yoy(S.cpi, '2026-09')!), what: 'consumer prices (CPI), 12 months to September 2026' },
  { key: 'cpiSep25', text: pct(yoy(S.cpi, '2025-09')!), what: 'CPI, 12 months to September 2025' },
  { key: 'cpiJan26', text: pct(yoy(S.cpi, '2026-01')!), what: 'CPI, 12 months to January 2026 (the low point of the last year)' },
  { key: 'coreSep26', text: pct(yoy(S.coreCpi, '2026-09')!), what: 'core CPI (excluding food and energy), 12 months to September 2026' },
  { key: 'cpiCum', text: pct((at(S.cpi, '2026-09')! / at(S.cpi, '2020-01')! - 1) * 100), what: 'cumulative rise in the CPI price level, January 2020 to September 2026' },
  { key: 'aheCum', text: pct((at(S.ahe, '2026-09')! / at(S.ahe, '2020-01')! - 1) * 100), what: 'cumulative rise in average hourly earnings, January 2020 to September 2026' },
  { key: 'aheSep26', text: pct(yoy(S.ahe, '2026-09')!), what: 'average hourly earnings, 12 months to September 2026' },
  { key: 'mort26', text: `${at(S.mortgage30, '2026-10')}%`, what: '30-year fixed mortgage rate, October 2026 (monthly average)' },
  { key: 'mort25', text: `${at(S.mortgage30, '2025-10')}%`, what: '30-year fixed mortgage rate, October 2025' },
  { key: 'mort21', text: `${at(S.mortgage30, '2021-01')}%`, what: '30-year fixed mortgage rate, January 2021' },
  { key: 'ff26', text: `${at(S.fedFunds, '2026-10')}%`, what: 'federal funds rate, October 2026 (it was 3.63% from May to August 2026 and has risen since)' },
  { key: 'ffLow', text: `${at(S.fedFunds, '2026-08')}%`, what: 'federal funds rate, August 2026' },
  { key: 'save26', text: `${at(S.savingRate, '2026-10')}%`, what: 'personal saving rate (share of disposable income), October 2026' },
  { key: 'save25', text: `${at(S.savingRate, '2025-10')}%`, what: 'personal saving rate, October 2025' },
  { key: 'sent26', text: `${at(S.sentiment, '2026-10')}`, what: 'University of Michigan consumer sentiment index, October 2026' },
  { key: 'sentJan25', text: `${at(S.sentiment, '2025-01')}`, what: 'consumer sentiment index, January 2025' },
  { key: 'sentLow', text: `${at(S.sentiment, '2026-05')}`, what: 'consumer sentiment index, May 2026 (the lowest reading since at least 2016 in our data)' },
  { key: 'pceOct26', text: pct(yoy(S.realPce, '2026-10')!), what: 'real (inflation-adjusted) consumer spending, 12 months to October 2026' },
  { key: 'unemp26', text: `${at(S.unemployment, '2026-10')}%`, what: 'unemployment rate, October 2026' },
];

/** Verbatim excerpts whose text was matched against retrieved sources by the production pipeline (quote_verified = true). */
export const QUOTES_HOUSEHOLDS = [
  { source: 'University of Michigan Surveys of Consumers (via retrieved source S6)', text: 'Since mid-2022, consumer sentiment has been moving more closely with sentiment regarding higher prices than with sentiment regarding income.' },
  { source: 'Mark Zandi, Moody’s Analytics, quoted by CNBC (S8)', text: "Perhaps the largest contributor to the outsized inflation reading in Tuesday's CPI report was housing, Zandi said." },
  { source: 'Consumer-behaviour research note (S13)', text: 'Primarily, consumers started trading down, but as inflation’s impact on consumers persisted, broader behaviors started to change; these included less frequent purchases, shifting from restaurants to eating at home' },
];

const BRIEF_HOUSEHOLDS = `ANALYTICAL BRIEF (completed by the research desk — treat as settled; your job is the writing)

Working question: why do households feel poorer even when inflation falls — and what happens now that it is rising again?

The argument (the author's view — keep it): The "inflation is falling" story was always a story about the rate, while households live with the level. Prices are up {cpiCum} since January 2020 while average hourly pay is up {aheCum} — on average, pay has more than kept pace with prices, yet the price of borrowing has not gone back. A household that took out a mortgage in January 2021 faced a rate of {mort21}; in October 2026 the rate was {mort26}. So the squeeze people describe is less about the grocery bill alone than about the cost of getting onto, or moving up, the housing and credit ladder — and it is now being compounded because headline inflation has turned up again.

What the evidence shows:
1. Inflation fell to {cpiJan26} in the 12 months to January 2026, then re-accelerated to {cpiSep26} by September 2026, up from {cpiSep25} a year earlier. Core inflation is {coreSep26}: the recent rise is concentrated in food and energy, the purchases people notice most often.
2. Hourly earnings grew {aheSep26} in the year to September 2026 — slower than prices, so the average worker's pay is again losing purchasing power.
3. Borrowing costs: the 30-year mortgage rate was {mort25} in October 2025 and {mort26} in October 2026. The Federal Reserve held its rate at {ffLow} through August 2026 and has since raised it to {ff26}.
4. Households are still spending — real consumer spending is up {pceOct26} on a year earlier — but the saving rate fell from {save25} to {save26}: some of that spending is being financed by saving less.
5. Sentiment is very weak: {sent26} in October 2026, against {sentJan25} in January 2025 and a low of {sentLow} in May 2026. Unemployment is {unemp26}, so this is not a jobs story.

Mechanism (for context; the full mechanism belongs to a later section): price level vs inflation rate; nominal pay vs real pay; the lock-in of past borrowing costs into the price of anything bought on credit; spending sustained by lower saving, which cannot continue indefinitely.

What the evidence does NOT establish: it does not show which households are hit hardest (no income-group or renter/owner breakdown here); it does not prove that mortgage rates cause the sentiment slump; and it cannot say whether the 2026 rise in headline inflation will persist.

Verified quotations you may use (quote exactly, attribute as given, or do not use):
${QUOTES_HOUSEHOLDS.map((q) => `- "${q.text}" — ${q.source}`).join('\n')}`;

const FACT_LIST = FACTS_HOUSEHOLDS.map((f) => `- ${f.text} — ${f.what}`).join('\n');
const resolve = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => FACTS_HOUSEHOLDS.find((f) => f.key === k)?.text ?? `{${k}}`);

const E_PROMPT = `${STYLE_GUIDE}

FACT SHEET (the ONLY figures you may use; write them exactly as shown):
${FACT_LIST}

${resolve(BRIEF_HOUSEHOLDS)}

TASK: Write a feature article for Seshat — a financial magazine for intelligent general readers — of 900–1,200 words, based only on the brief and fact sheet above.
- Format: a headline line starting "# ", then a one- or two-sentence dek in italics, then the article in paragraphs. Subheads only if they genuinely help.
- Use only figures from the fact sheet, written exactly as shown. Do not calculate new figures, round or restate them differently, or use figures from memory. Years are fine.
- No invented people, anecdotes, scenes, quotes or sources. Quotations only from the verified list, verbatim.
- No investment advice and no predictions stated as fact.
Return only the article.`;

// ── Deterministic checks ────────────────────────────────────────────────────
const allowedNumbers = () => {
  const s = new Set<string>();
  for (const f of FACTS_HOUSEHOLDS) {
    const n = f.text.replace(/[%$,]/g, '');
    s.add(n);
    s.add(String(Number(n)));
  }
  for (const extra of ['3.63', '2020', '2021', '2022', '2025', '2026', '2016', '30', '12', '30-year', '10']) s.add(extra);
  return s;
};
const ALLOWED = allowedNumbers();

/** Numbers in the article that are not in the fact sheet (years and the "30-year"/"12-month" labels excluded). */
export function unsupportedNumbers(text: string, allowed = ALLOWED): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?%| percent| per cent| points?| basis points?| bps?| million| billion| trillion)?/gi)) {
    const raw = m[1].replace(/,/g, '');
    const unit = (m[2] ?? '').trim();
    if (/^(19|20)\d\d$/.test(raw) && !unit) continue; // a year
    if (!unit && Number(raw) <= 12 && /^\d+$/.test(raw)) continue; // small counts / months ("three", "12 months")
    if (allowed.has(raw) || allowed.has(String(Number(raw)))) continue;
    out.push(m[0].trim());
  }
  return [...new Set(out)];
}

/** Quoted passages (≥ 6 words) that are not verbatim from the verified list. */
export function inventedQuotes(text: string, quotes = QUOTES_HOUSEHOLDS.map((q) => q.text)): string[] {
  const norm = (t: string) => t.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
  const pool = quotes.map(norm);
  const out: string[] = [];
  for (const m of text.matchAll(/["“]([^"”]{20,400})["”]/g)) {
    const q = norm(m[1]);
    if (q.split(' ').length < 6) continue;
    if (!pool.some((p) => p.includes(q.replace(/[.,]$/, '')))) out.push(m[1].slice(0, 120));
  }
  return out;
}

export function articleParagraphs(text: string): { headline: string | null; paragraphs: string[] } {
  const lines = text.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const headline = lines.find((l) => l.startsWith('# '))?.slice(2).trim() ?? null;
  const paragraphs = lines.filter((l) => !l.startsWith('#') && !/^[*_].*[*_]$/.test(l) && !/^[-=*]{3,}$/.test(l));
  return { headline, paragraphs };
}

function gradeE(r: CallResult): Check[] {
  const t = r.content;
  const { headline, paragraphs } = articleParagraphs(t);
  const sig = proseSignals(paragraphs);
  const nums = unsupportedNumbers(t);
  const quotes = inventedQuotes(t);
  const braces = t.match(/\{[a-zA-Z0-9]+\}/g) ?? [];
  const probs = probabilityLanguage(t);
  return [
    { id: 'finished', pass: r.finishReason === 'stop', detail: `finish=${r.finishReason}`, weight: 0 },
    { id: 'has_headline', pass: !!headline, detail: headline ?? '' },
    { id: 'length_900_1200', pass: sig.words >= 800 && sig.words <= 1350, detail: `${sig.words} words` },
    { id: 'no_unsupported_numbers', pass: nums.length === 0, detail: nums.join(', ') || 'none' },
    { id: 'no_invented_quotes', pass: quotes.length === 0, detail: quotes.join(' | ') || 'none' },
    { id: 'no_raw_tokens', pass: braces.length === 0, detail: braces.slice(0, 5).join(' ') || 'none' },
    { id: 'no_probabilities', pass: probs.length === 0, detail: probs.join('; ') || 'none' },
    { id: 'signals', pass: null, detail: JSON.stringify(sig) },
  ];
}

export function writingCases(): Case[] {
  return [
    {
      id: 'E1-feature-households',
      suite: 'E',
      category: 'editorial writing',
      subject: 'households-feel-poorer',
      fixtureVersion: `${WRITING_VERSION}+style-guide@${STYLE_GUIDE_VERSION}+macro-us@${M.retrievedAt.slice(0, 10)}`,
      messages: [
        { role: 'system', content: 'You are a staff writer at Seshat, an independent financial magazine. A human editor commissioned this piece and has final authority.' },
        { role: 'user', content: E_PROMPT },
      ],
      params: { max_tokens: 3200, temperature: 0.7, top_p: 0.95 },
      stream: true,
      timeoutMs: 600_000,
      evaluate: gradeE,
    },
  ];
}
