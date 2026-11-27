// Structured quantity metadata and numerical-claim checking.
//
// Every fact carries a Quantity describing WHAT the number is — a level or a
// change (over which window), its unit and denominator ($/MW vs $/MWh), stock
// vs flow, historical vs forecast, and the period it refers to. Data facts get
// it deterministically from the series; quoted source figures get it from the
// synthesis model and then have it checked against the quote text.
//
// Each sentence that states a figure is then checked against that metadata:
// change language on a level, level language on a change, period mismatches
// ("year-over-year" with a five-year change), time framing on a per-unit cost,
// foreign denominators, forecasts stated as outcomes, comparisons across
// incompatible quantities, stocks described as flows and mismatched years.
// These are structural checks on the metadata — not patterns for specific
// past mistakes.
import type { Fact } from '../data/display.ts';

export type QuantityKind = 'level' | 'change' | 'rate';
export type Measure = 'stock' | 'flow' | 'price' | 'rate' | 'index' | 'ratio' | 'count' | 'other';
export type Temporal = 'historical' | 'forecast' | 'estimate' | 'target';

export type Quantity = {
  kind: QuantityKind;
  /** For changes: the comparison window. */
  window?: '1y' | '5y' | 'other';
  /** Unit label, e.g. "%", "pp", "US$", "yen per US dollar", "thousand barrels/day". */
  unit: string;
  /** Normalised denominator, e.g. "mw", "kwh", "barrel", "day", "share" (none for plain amounts). */
  denominator?: string;
  measure: Measure;
  temporal: Temporal;
  /** Reporting period or observation date (ISO date or free text such as "2025" / "Q3 2026"). */
  period?: string;
};

export type QuantityFact = Fact & { quantity?: Quantity; quantityNotes?: string[] };

// ── Denominators ─────────────────────────────────────────────────────────
const DENOM_SYNONYMS: [RegExp, string][] = [
  [/^(mw|megawatts?)$/i, 'mw'],
  [/^(mwh|megawatt-?hours?)$/i, 'mwh'],
  [/^(kw|kilowatts?)$/i, 'kw'],
  [/^(kwh|kilowatt-?hours?)$/i, 'kwh'],
  [/^(gw|gigawatts?)$/i, 'gw'],
  [/^(gwh|gigawatt-?hours?)$/i, 'gwh'],
  [/^(bbl|barrels?)$/i, 'barrel'],
  [/^(d|days?|daily)$/i, 'day'],
  [/^(months?|monthly|mo)$/i, 'month'],
  [/^(years?|yr|annum|annually|annual)$/i, 'year'],
  [/^(shares?)$/i, 'share'],
  [/^(mmbtu|million btu)$/i, 'mmbtu'],
  [/^(ounces?|oz)$/i, 'ounce'],
  [/^(gallons?|gal)$/i, 'gallon'],
  [/^(square feet|sq ?ft|sqft)$/i, 'sqft'],
  [/^(households?)$/i, 'household'],
  [/^(people|persons?|capita)$/i, 'person'],
  [/^(u\.?s\.? ?dollars?|usd|dollars?|\$)$/i, 'usd'],
];
export function normDenominator(d: string | undefined | null): string | undefined {
  if (!d) return undefined;
  const s = d.trim().replace(/^(per|a|an|each|\/)\s*/i, '').replace(/\.$/, '');
  if (!s) return undefined;
  for (const [re, n] of DENOM_SYNONYMS) if (re.test(s)) return n;
  return s.toLowerCase();
}
const TIME_DENOMS = new Set(['day', 'month', 'year']);

// ── Claim checks ─────────────────────────────────────────────────────────
export type ClaimIssue = { code: string; message: string; severity: 'error' | 'warning' };
export type ClaimRecord = { path: string; sentence: string; tokens: string[]; status: 'ok' | 'flagged'; issues: ClaimIssue[] };

const TOKEN = /\{([a-zA-Z0-9]+)(\.date)?(?::(short|abs))?\}/g;
const QUAL = String.raw`(?:by\s+|some\s+|nearly\s+|about\s+|almost\s+|roughly\s+|around\s+|more than\s+|over\s+|less than\s+)?`;
const CHANGE_VERB = String.raw`(?:rose|risen|rises|rising|increased|increases|jumped|jumps|climbed|climbs|grew|grown|grows|gained|gains|added|fell|fallen|falls|dropped|drops|declined|declines|decreased|slid|slipped|lost|loses|surged|soared|plunged|tumbled|shrank|shrunk|contracted|expanded|up|down)`;
const LEVEL_VERB = String.raw`(?:stands? at|stood at|reached|reaches|reaching|hit|hits|sits? at|sat at|rose to|risen to|fell to|fallen to|climbed to|dropped to|declined to|jumped to|averaged|totall?ed)`;
const ONE_YEAR = /\b(year[- ]over[- ]year|year[- ]on[- ]year|y\/y|yoy|over the (?:past|last) (?:year|12 months|twelve months)|in the (?:past|last) year|from a year (?:earlier|ago)|annual (?:increase|rise|growth|decline|fall)|this year|12-month)\b/i;
const FIVE_YEAR = /\b(five years|5 years|half[- ]decade|five-year (?:increase|rise|change|decline|fall|gain))\b/i;
const TIME_FRAME = /\b(year[- ]over[- ]year|year[- ]on[- ]year|annually|per year|a year|each year|every year|per month|a month|monthly)\b/i;
const HEDGE = /\b(expect|expects|expected|forecasts?|forecasted|projects?|projected|projections?|estimates?|estimated|could|may|might|would|will|likely|anticipat\w*|outlook|scenario|predict\w*|plans?|planned|targets?|aims?|seen|set to|on track)\b/i;
const FLOW_FRAME = /^\s*(?:per|a|an|each)\s+(day|month|year)\b/i;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).filter((s) => s.trim());
}

function sig(f: QuantityFact): string {
  const q = f.quantity;
  if (!q) return `${f.format}`;
  return `${q.kind}|${q.unit}|${q.denominator ?? ''}`;
}

/** Check every figure-bearing sentence of one text field against its facts' quantity metadata. */
export function checkText(path: string, text: string, facts: Record<string, QuantityFact>, resolve: (s: string) => string): ClaimRecord[] {
  const out: ClaimRecord[] = [];
  for (const sentence of sentencesOf(text)) {
    const toks = [...sentence.matchAll(TOKEN)].filter((m) => !m[2] && facts[m[1]]);
    if (!toks.length) continue;
    const issues: ClaimIssue[] = [];
    const add = (code: string, severity: 'error' | 'warning', message: string) => {
      if (!issues.some((i) => i.code === code && i.message === message)) issues.push({ code, severity, message });
    };
    const keys = [...new Set(toks.map((m) => m[1]))];
    const changeToks = keys.filter((k) => facts[k].quantity?.kind === 'change');

    for (const key of keys) {
      const f = facts[key];
      const q = f.quantity;
      if (!q) continue;
      const tok = String.raw`\{${key}(?::(?:short|abs))?\}`;
      const label = `{${key}}`;
      // 1. Change language attached to a level (e.g. "jumped by {costPerMW}").
      if (q.kind === 'level' && new RegExp(String.raw`\b${CHANGE_VERB}\s+${QUAL}${tok}`, 'i').test(sentence))
        add('level-as-change', 'error', `${label} is a level (${q.unit}${q.denominator ? ' per ' + q.denominator : ''}), but the sentence presents it as a change`);
      // 2. Level language attached to a change (e.g. "reached {chg5y}").
      if (q.kind === 'change' && new RegExp(String.raw`\b${LEVEL_VERB}\s+(?:a\s+(?:high|low)\s+of\s+)?${tok}`, 'i').test(sentence))
        add('change-as-level', 'error', `${label} is a ${q.window ?? ''} change, but the sentence presents it as a level`);
      // 3. Period mismatch for changes.
      if (q.kind === 'change' && changeToks.length === 1) {
        if (q.window === '5y' && ONE_YEAR.test(sentence) && !FIVE_YEAR.test(sentence)) add('period-mismatch', 'error', `${label} is a five-year change, but the sentence describes a one-year change`);
        if (q.window === '1y' && FIVE_YEAR.test(sentence) && !ONE_YEAR.test(sentence)) add('period-mismatch', 'error', `${label} is a one-year change, but the sentence describes a five-year change`);
      }
      // 4. Time framing on a per-unit quantity that is not a rate over time (the $/MW-as-annual-increase class).
      if (q.kind === 'level' && q.denominator && !TIME_DENOMS.has(q.denominator) && TIME_FRAME.test(sentence) && keys.length === 1)
        add('rate-framing', 'error', `${label} is measured per ${q.denominator}, not per period; "year-over-year"/"annually" framing changes its meaning`);
      // 5. Foreign denominator right after the token.
      const after = sentence.split(new RegExp(tok))[1] ?? '';
      const dm = /^\s*(?:per|a|an|each|\/)\s*([a-z][a-z-]*(?:\s+btu)?)/i.exec(after);
      if (dm) {
        const said = normDenominator(dm[1]);
        if (q.denominator && said && said !== q.denominator && !(TIME_DENOMS.has(said) && q.measure === 'flow'))
          add('unit-mismatch', 'error', `${label} is per ${q.denominator}, but the sentence says per ${dm[1]}`);
        // 6. Stock described as a flow ("inventories of {x} per day").
        if (q.measure === 'stock' && FLOW_FRAME.test(after)) add('stock-as-flow', 'error', `${label} is a stock (an amount at a point in time), but the sentence states it per ${dm[1]}`);
      }
      // 7. Forecast or estimate stated as an outcome.
      if (q.temporal !== 'historical' && !HEDGE.test(sentence))
        add('forecast-as-fact', 'warning', `${label} is a ${q.temporal} (${q.period ?? 'future period'}), but the sentence states it as an outcome`);
    }

    // 8. Comparisons across incompatible quantities ("from {a} to {b}", "{a} versus {b}").
    const pairRe = new RegExp(String.raw`(?:from\s+\{([a-zA-Z0-9]+)(?::abs)?\}\s+to\s+\{([a-zA-Z0-9]+)(?::abs)?\})|(?:\{([a-zA-Z0-9]+)(?::abs)?\}\s+(?:versus|vs\.?|compared (?:with|to)|than)\s+\{([a-zA-Z0-9]+)(?::abs)?\})`, 'gi');
    for (const m of sentence.matchAll(pairRe)) {
      const a = facts[m[1] ?? m[3]];
      const b = facts[m[2] ?? m[4]];
      if (a?.quantity && b?.quantity && sig(a) !== sig(b))
        add('dimension-mismatch', 'error', `{${m[1] ?? m[3]}} (${sig(a).replace(/\|/g, ' ')}) and {${m[2] ?? m[4]}} (${sig(b).replace(/\|/g, ' ')}) are not comparable quantities`);
    }

    // 9. Explicit year that contradicts the only dated figure in the sentence.
    const dated = keys.filter((k) => facts[k].quantity?.kind === 'level' && facts[k].date);
    const years = [...sentence.replace(TOKEN, ' ').matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]);
    if (dated.length === 1 && keys.length === 1 && years.length === 1 && !/\.date\}/.test(sentence)) {
      const fy = facts[dated[0]].date!.slice(0, 4);
      if (years[0] !== fy && !/\bsince\b|\bfrom\b|\bbefore\b|\bafter\b|\buntil\b|\bby\b/i.test(sentence))
        add('date-mismatch', 'warning', `{${dated[0]}} refers to ${fy}, but the sentence mentions ${years[0]}`);
    }

    out.push({ path, sentence: resolve(sentence).slice(0, 320), tokens: keys, status: issues.length ? 'flagged' : 'ok', issues });
  }
  return out;
}

// ── Quoted source figures: verify the model's quantity metadata against the quote ──
const FORECAST_WORDS = /\b(will|forecasts?|forecasted|projects?|projected|projections?|expects?|expected|outlook|by 20\d\d|through 20\d\d|set to|on track to)\b/i;
const ESTIMATE_WORDS = /\b(estimates?|estimated|approximately|roughly)\b/i;
const TARGET_WORDS = /\b(targets?|aims? to|goal|plans? to|pledged?)\b/i;
const CHANGE_WORDS = /\b(increase[ds]?|rise|rose|risen|growth|grew|grown|gain(?:ed|s)?|up|down|decline[ds]?|fell|fallen|drop(?:ped|s)?|jump(?:ed|s)?|cut|cuts|reduc(?:e|ed|tion)|added|more than .{0,20} (?:ago|earlier)|higher than|lower than|year[- ]over[- ]year|from .{1,30} to)\b/i;

export type ModelQuantity = { kind: QuantityKind; measure: Measure; unit: string; denominator: string; temporal: Temporal; period: string };

export function verifyQuotedQuantity(figure: string, quote: string, m: ModelQuantity): { quantity: Quantity; notes: string[] } {
  const notes: string[] = [];
  const q: Quantity = { kind: m.kind, unit: m.unit || 'unspecified', measure: m.measure, temporal: m.temporal, period: m.period || undefined };
  // Temporal status is read from the quote itself; the model's label cannot make a forecast historical.
  if (m.temporal === 'historical') {
    if (FORECAST_WORDS.test(quote)) {
      q.temporal = 'forecast';
      notes.push('Quote uses forward-looking language; reclassified as a forecast.');
    } else if (ESTIMATE_WORDS.test(quote)) {
      q.temporal = 'estimate';
      notes.push('Quote describes an estimate; reclassified.');
    } else if (TARGET_WORDS.test(quote)) {
      q.temporal = 'target';
      notes.push('Quote describes a target or plan; reclassified.');
    }
  }
  // Denominator must be visible in the figure or the quote (with synonyms).
  const d = normDenominator(m.denominator);
  if (d) {
    const hay = `${figure} ${quote}`.toLowerCase();
    const visible = [...hay.matchAll(/(?:per|\/|a|an|each)\s*([a-z][a-z-]*(?:\s+btu)?)/g)].some((x) => normDenominator(x[1]) === d) || /\/\s*mw\b/i.test(hay) && d === 'mw';
    if (visible) q.denominator = d;
    else notes.push(`Denominator "${m.denominator}" is not stated in the quote; treated as unknown.`);
  } else {
    // The quote states a denominator the model omitted → keep the quote's.
    const fm = /(?:per|\/)\s*([a-z][a-z-]*)/i.exec(figure);
    if (fm && normDenominator(fm[1])) {
      q.denominator = normDenominator(fm[1]);
      notes.push(`Figure is stated per ${fm[1]}.`);
    }
  }
  // A "change" needs change language in the quote; otherwise it is a level.
  if (m.kind === 'change' && !CHANGE_WORDS.test(quote)) {
    q.kind = 'level';
    notes.push('No change language in the quote; treated as a level, not a change.');
  }
  return { quantity: q, notes };
}
