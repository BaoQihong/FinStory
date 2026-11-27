// Classify a provider's unit string so that application code — never the
// LLM — decides how a series may be transformed and displayed.
//
//   rate   — already a percentage (yields, policy rates, unemployment, % changes).
//            Changes are expressed in percentage points.
//   index  — an index level (CPI, PCE price index, equity index). Never shown
//            as a rate; inflation-style rates must be computed (YoY %).
//   level  — a quantity or price (yen per dollar, $ per barrel, barrels).
//            Changes are expressed as percent changes.
import type { UnitDisplay } from '../data/display.ts';

export type UnitKind = 'rate' | 'index' | 'level';

export type UnitInfo = {
  kind: UnitKind;
  /** How a single value is dressed in copy and on axes. */
  display: UnitDisplay;
  /** Short axis/table label. */
  label: string;
  decimals: number;
};

const RULES: { test: RegExp; info: (u: string) => UnitInfo }[] = [
  { test: /^percent|percentage|^pct\b|% chg|percent change/i, info: () => ({ kind: 'rate', display: { prefix: '', suffix: '%' }, label: '%', decimals: 2 }) },
  { test: /^index\b|index \d{4}|=\s*100|^index \(/i, info: () => ({ kind: 'index', display: { prefix: '', suffix: '' }, label: 'index', decimals: 1 }) },
  { test: /yen to (one )?u\.?s\.? dollar/i, info: () => ({ kind: 'level', display: { prefix: '¥', suffix: '' }, label: 'yen per US dollar', decimals: 2 }) },
  { test: /u\.?s\.? dollars? to (one )?(euro|british pound|pound)/i, info: (u) => ({ kind: 'level', display: { prefix: '$', suffix: '' }, label: u, decimals: 4 }) },
  { test: /to (one )?u\.?s\.? dollar/i, info: (u) => ({ kind: 'level', display: { prefix: '', suffix: '' }, label: u.toLowerCase(), decimals: 4 }) },
  { test: /dollars per barrel/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: ' a barrel' }, label: 'US$ per barrel', decimals: 2 }) },
  { test: /dollars per million btu/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: ' per million Btu' }, label: 'US$ per MMBtu', decimals: 2 }) },
  { test: /dollars per (troy )?ounce/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: ' an ounce' }, label: 'US$ per ounce', decimals: 2 }) },
  { test: /dollars per gallon/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: ' a gallon' }, label: 'US$ per gallon', decimals: 3 }) },
  { test: /^mbbl\/d$/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand barrels a day' }, label: 'thousand barrels/day', decimals: 0 }) },
  { test: /^mbbl$/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand barrels' }, label: 'thousand barrels', decimals: 0 }) },
  { test: /cents per kilowatt-?hour/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' cents per kWh' }, label: 'cents per kWh', decimals: 2 }) },
  { test: /million kilowatt-?hours/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' million kWh' }, label: 'million kWh', decimals: 0 }) },
  { test: /thousand megawatt-?hours/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand MWh' }, label: 'thousand MWh', decimals: 0 }) },
  { test: /^thousands of units$/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand units' }, label: 'thousand units', decimals: 0 }) },
  { test: /^number of units$/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' units' }, label: 'units', decimals: 0 }) },
  { test: /months'? supply/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: " months' supply" }, label: "months' supply", decimals: 1 }) },
  { test: /^level$/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: '' }, label: 'count', decimals: 0 }) },
  { test: /^u\.?s\.? dollars?$|^dollars$|^current dollars$|^current u\.?s\.? dollars$/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: '' }, label: 'US$', decimals: 2 }) },
  { test: /thousands? of barrels per day/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand barrels a day' }, label: 'thousand barrels/day', decimals: 0 }) },
  { test: /thousands? of barrels/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand barrels' }, label: 'thousand barrels', decimals: 0 }) },
  { test: /billions? of (u\.?s\.? )?dollars/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: ' billion' }, label: 'US$ billion', decimals: 1 }) },
  { test: /millions? of (u\.?s\.? )?dollars/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: ' million' }, label: 'US$ million', decimals: 0 }) },
  { test: /^thousands of persons/i, info: () => ({ kind: 'level', display: { prefix: '', suffix: ' thousand people' }, label: 'thousands of people', decimals: 0 }) },
  { test: /us dollars per share|usd per share/i, info: () => ({ kind: 'level', display: { prefix: '$', suffix: '' }, label: 'US$ per share', decimals: 2 }) },
];

export function unitInfo(units: string): UnitInfo {
  for (const r of RULES) if (r.test.test(units)) return r.info(units);
  // Unknown unit: show the provider's own wording after the number — never guess a scale.
  return { kind: 'level', display: { prefix: '', suffix: ` (${units})` }, label: units, decimals: 2 };
}

/**
 * Exchange-rate quote convention, e.g. "Japanese Yen to One U.S. Dollar" →
 * { quote: 'Japanese Yen', base: 'U.S. Dollar' }: the series counts units of
 * `quote` per one `base`, so a RISE means the quote currency WEAKENED.
 */
export function fxQuote(units: string): { quote: string; base: string; quoteWord: string } | null {
  const clean = units.replace(/\s+/g, ' ').trim();
  const m = /^(.+?) to (?:one|1) (.+)$/i.exec(clean);
  if (!m || !CURRENCY.test(m[1]) || !CURRENCY.test(m[2])) return null;
  const quote = m[1].trim();
  const base = m[2].trim().replace(/\$/, 'Dollar');
  const word = quote.split(' ').at(-1)!.replace(/s$/i, '');
  return { quote, base, quoteWord: word[0].toUpperCase() + word.slice(1).toLowerCase() };
}
const CURRENCY = /dollar|\$|yen|euro|pound|yuan|renminbi|franc|won|rupee|peso|real|krona|krone|rand|lira|ringgit|baht/i;

/** Two series may share a chart axis only when their display units are identical. */
export function sameAxis(a: string, b: string): boolean {
  const x = unitInfo(a);
  const y = unitInfo(b);
  return x.kind === y.kind && x.label === y.label && x.display.prefix === y.display.prefix && x.display.suffix === y.display.suffix;
}

/** Coarse frequency class used for alignment rules. */
export function frequencyClass(freq: string): 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'other' {
  const f = freq.toLowerCase();
  if (f.startsWith('daily')) return 'daily';
  if (f.startsWith('weekly')) return 'weekly';
  if (f.startsWith('monthly')) return 'monthly';
  if (f.startsWith('quarterly')) return 'quarterly';
  if (f.startsWith('annual')) return 'annual';
  return 'other';
}
