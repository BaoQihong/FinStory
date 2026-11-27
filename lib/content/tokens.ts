// Resolve fact tokens in editorial copy against a story's data module.
//
//   {key}          → formatted value          e.g. "5.31%", "1.34 percentage points"
//   {key:short}    → compact value            e.g. "1.34 pp"
//   {key:abs}      → magnitude without sign    e.g. "28.3%" (after "fell by")
//   {key.date}     → the fact's date          e.g. "5 October 2026", "September 2026", "Q3 2026"
//   {dateKey}      → a date fact              e.g. "May 2002"
//
// Unknown tokens throw, so a typo fails the build and the validation script
// instead of shipping a broken sentence.
import type { DateFact, Fact } from '../data/display.ts';
import { fmtDay, fmtMonth, fmtQuarter } from '../format.ts';

export type TokenContext = { facts: Record<string, Fact>; dates: Record<string, DateFact> };

const TOKEN = /\{([a-zA-Z0-9]+)(?:\.(date))?(?::(short|abs))?\}/g;

export function formatDate(iso: string, precision: 'day' | 'month' | 'quarter' | 'year' = 'day') {
  if (precision === 'year') return iso.slice(0, 4);
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
  if (f.format === 'text') return f.text ?? n;
  if (f.format === 'level') {
    const sign = f.value < 0 ? '−' : '';
    const abs = Math.abs(f.value).toLocaleString('en-US', { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
    return `${sign}${f.unit?.prefix ?? ''}${abs}${short ? '' : (f.unit?.suffix ?? '')}`;
  }
  return n;
}

/**
 * Draft-safe resolver: unknown tokens render as a visible marker instead of
 * throwing, so an editor can preview a draft that still has problems (the
 * validator reports every unknown token separately).
 */
export function resolveTokensSafe(text: string, ctx: TokenContext): string {
  return text.replace(TOKEN, (whole) => {
    try {
      return resolveTokens(whole, ctx);
    } catch {
      return `⟦${whole.slice(1, -1)}?⟧`;
    }
  });
}

export function resolveTokens(text: string, ctx: TokenContext): string {
  return text.replace(TOKEN, (whole, key: string, date?: string, mod?: string) => {
    const fact = ctx.facts[key];
    if (fact) {
      if (date) {
        if (!fact.date) throw new Error(`token ${whole}: fact has no date`);
        return formatDate(fact.date, fact.datePrecision);
      }
      if (mod === 'abs') return formatFact({ ...fact, value: Math.abs(fact.value) });
      return formatFact(fact, mod === 'short');
    }
    const d = ctx.dates[key];
    if (d && !date && !mod) return formatDate(d.date, d.datePrecision);
    throw new Error(`unknown fact token ${whole}`);
  });
}

/** All tokens referenced in a string (used by the validator). */
export function listTokens(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[0]);
}
