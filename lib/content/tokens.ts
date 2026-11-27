// Resolve fact tokens in editorial copy against a story's data module.
//
//   {key}          → formatted value          e.g. "5.31%", "1.34 percentage points"
//   {key:short}    → compact value            e.g. "1.34 pp"
//   {key.date}     → the fact's date          e.g. "5 October 2026", "September 2026", "Q3 2026"
//   {dateKey}      → a date fact              e.g. "May 2002"
//
// Unknown tokens throw, so a typo fails the build and the validation script
// instead of shipping a broken sentence.
import type { DateFact, Fact } from '../data/display.ts';
import { fmtDay, fmtMonth, fmtQuarter } from '../format.ts';

export type TokenContext = { facts: Record<string, Fact>; dates: Record<string, DateFact> };

const TOKEN = /\{([a-zA-Z0-9]+)(?:\.(date))?(?::(short))?\}/g;

export function formatDate(iso: string, precision: 'day' | 'month' | 'quarter' = 'day') {
  if (precision === 'month') return fmtMonth(iso);
  if (precision === 'quarter') return fmtQuarter(iso);
  return fmtDay(iso);
}

export function formatFact(f: Fact, short = false): string {
  const n = f.value.toFixed(f.decimals);
  if (f.format === 'pct') return `${n}%`;
  if (f.format === 'pp') {
    if (short) return `${n} pp`;
    return `${n} percentage ${f.value === 1 ? 'point' : 'points'}`;
  }
  return n;
}

export function resolveTokens(text: string, ctx: TokenContext): string {
  return text.replace(TOKEN, (whole, key: string, date?: string, short?: string) => {
    const fact = ctx.facts[key];
    if (fact) {
      if (date) {
        if (!fact.date) throw new Error(`token ${whole}: fact has no date`);
        return formatDate(fact.date, fact.datePrecision);
      }
      return formatFact(fact, Boolean(short));
    }
    const d = ctx.dates[key];
    if (d && !date && !short) return formatDate(d.date, d.datePrecision);
    throw new Error(`unknown fact token ${whole}`);
  });
}

/** All tokens referenced in a string (used by the validator). */
export function listTokens(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[0]);
}
