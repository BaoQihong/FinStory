// Tests A–D (analytical ability). Every model receives identical prompts built
// from the frozen FRED fixture; answer keys are computed here, never typed.
// Prose answers are graded qualitatively (rubric in the report); the
// <answers> JSON blocks are graded deterministically.
import type { CallResult } from '../lib/arli.ts';
import { extractJson, tagged } from '../lib/json.ts';
import type { Case, Check } from '../lib/types.ts';
import { at, diff, level, loadMacro, months, paired, pctChange, pearson, r1, r2, table, yoy } from '../fixtures/stats.ts';

export const ANALYSIS_VERSION = 'analysis-v1';
const M = loadMacro();
const S = M.series;

const ANALYST_SYSTEM = `You are a senior economics editor at an independent financial magazine. You reason carefully from the evidence you are given, say plainly what the data does not show, and never invent data, statistics or sources. Write in clear English.`;

const ck = (id: string, pass: boolean | null, detail?: string, weight = 1): Check => ({ id, pass, detail, weight });
const near = (v: unknown, target: number, tol: number) => typeof v === 'number' && Math.abs(v - target) <= tol + 1e-9;
const answersOf = (r: CallResult) => {
  const block = tagged(r.content, 'answers');
  if (!block) return null;
  const j = extractJson(block);
  return j.ok ? (j.value as Record<string, unknown>) : null;
};
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const common = (r: CallResult): Check[] => [ck('finished', r.finishReason === 'stop', `finish=${r.finishReason}`, 0), ck('has_content', r.content.trim().length > 200, `${words(r.content)} words`, 0)];
/** Probability language is forbidden in scenario work (D-019). */
export const probabilityLanguage = (t: string) => t.match(/\b\d{1,3}\s?(%|percent)\s+(chance|probability|likelihood|odds)|\b(probability|odds|chance)\s+of\s+\d|\b\d{1,3}\s?%\s+(likely|probable)|\b(likelihood|probability)\s*[:=]\s*\d/gi) ?? [];

// ── Test A: financial data interpretation (window Sep 2024 – Oct 2026) ──────
const A_FROM = '2024-09';
const A_TO = '2026-10';
const yoyS = (k: string, d: string) => yoy(S[k], d)!;
const KEY_A = {
  q1_cpi_yoy_2026_09: r1(yoyS('cpi', '2026-09')),
  q2_cpi_yoy_2025_09: r1(yoyS('cpi', '2025-09')),
  q3_change_pp: r1(yoyS('cpi', '2026-09') - yoyS('cpi', '2025-09')),
  q4_can_compute_cpi_yoy_2026_10: false,
  q5_ahe_yoy_2026_09: r1(yoyS('ahe', '2026-09')),
  q6_real_wage_growth_2026_09: r1(((1 + yoyS('ahe', '2026-09') / 100) / (1 + yoyS('cpi', '2026-09') / 100) - 1) * 100),
  q7_mortgage_change_pp: r2(at(S.mortgage30, '2026-10')! - at(S.mortgage30, '2025-10')!),
  q8_mortgage_change_pct: r1((at(S.mortgage30, '2026-10')! / at(S.mortgage30, '2025-10')! - 1) * 100),
  q9_fedfunds_change_bp: Math.round((at(S.fedFunds, '2026-10')! - at(S.fedFunds, '2024-09')!) * 100),
  q10_cpi_monthly_declines: months(A_FROM, A_TO).filter((d) => (pctChange(S.cpi)(d) ?? 1) < 0),
  q11_sentiment_low_month: months(A_FROM, A_TO).reduce((a, d) => ((at(S.sentiment, d) ?? 999) < (at(S.sentiment, a) ?? 999) ? d : a), A_FROM),
  q12_core_minus_headline_2026_09_pp: r1(yoyS('coreCpi', '2026-09') - yoyS('cpi', '2026-09')),
};

const A_PROMPT = `Below is a table of monthly US economic data from FRED (Federal Reserve Bank of St. Louis), exactly as published. "n/a (missing)" means the observation does not exist in the source; do not fill it in.

${table(M, ['cpi', 'coreCpi', 'ahe', 'fedFunds', 'mortgage30', 'realPce', 'unemployment', 'payrolls', 'sentiment', 'savingRate'], A_FROM, A_TO)}

Part 1 — Interpretation (about 400–600 words). What do these data say about the condition of US households over this period? Cover the trends that matter, any meaningful divergences between series, how conditions changed over the period, and the limitations of this data for judging household well-being. Distinguish levels from rates of change, and percentage changes from percentage-point changes. Do not use any data that is not in the table.

Part 2 — Answers. Compute from the table. Use 12-month percentage changes where asked (value / value 12 months earlier − 1). Round as instructed. End your reply with exactly one block:
<answers>
{"q1": <12-month CPI inflation in 2026-09, %, 1 decimal>,
 "q2": <12-month CPI inflation in 2025-09, %, 1 decimal>,
 "q3": <change from q2 to q1, in percentage points, 1 decimal>,
 "q4": <true/false: can 12-month CPI inflation for 2026-10 be computed from this table?>,
 "q5": <12-month growth of average hourly earnings in 2026-09, %, 1 decimal>,
 "q6": <approximate real (CPI-deflated) growth of average hourly earnings over the 12 months to 2026-09, %, 1 decimal>,
 "q7": <change in the 30-year mortgage rate from 2025-10 to 2026-10, in percentage points, 2 decimals>,
 "q8": <the same change expressed as a percentage change of the rate itself, %, 1 decimal>,
 "q9": <change in the federal funds rate from 2024-09 to 2026-10, in basis points, integer>,
 "q10": <list of months (YYYY-MM) in which the CPI index fell compared with the previous month; [] if none>,
 "q11": <month (YYYY-MM) with the lowest consumer sentiment reading>,
 "q12": <12-month core CPI inflation minus 12-month headline CPI inflation in 2026-09, percentage points, 1 decimal>}
</answers>`;

function gradeA(r: CallResult): Check[] {
  const a = answersOf(r);
  if (!a) return [...common(r), ck('answers_block', false, 'no parseable <answers> block')];
  const n = (k: string) => (typeof a[k] === 'string' ? Number(a[k]) : a[k]);
  const list = Array.isArray(a.q10) ? (a.q10 as unknown[]).map(String).sort() : null;
  return [
    ...common(r),
    ck('answers_block', true),
    ck('q1_yoy', near(n('q1'), KEY_A.q1_cpi_yoy_2026_09, 0.1), `got ${a.q1}, key ${KEY_A.q1_cpi_yoy_2026_09}`),
    ck('q2_yoy', near(n('q2'), KEY_A.q2_cpi_yoy_2025_09, 0.1), `got ${a.q2}, key ${KEY_A.q2_cpi_yoy_2025_09}`),
    ck('q3_pp', near(n('q3'), KEY_A.q3_change_pp, 0.1), `got ${a.q3}, key ${KEY_A.q3_change_pp}`),
    ck('q4_missing_data', a.q4 === false || a.q4 === 'false', `got ${a.q4}`),
    ck('q5_wage', near(n('q5'), KEY_A.q5_ahe_yoy_2026_09, 0.1), `got ${a.q5}, key ${KEY_A.q5_ahe_yoy_2026_09}`),
    ck('q6_real_wage', near(n('q6'), KEY_A.q6_real_wage_growth_2026_09, 0.15), `got ${a.q6}, key ${KEY_A.q6_real_wage_growth_2026_09}`),
    ck('q7_pp', near(n('q7'), KEY_A.q7_mortgage_change_pp, 0.01), `got ${a.q7}, key ${KEY_A.q7_mortgage_change_pp}`),
    ck('q8_pct_vs_pp', near(n('q8'), KEY_A.q8_mortgage_change_pct, 0.2), `got ${a.q8}, key ${KEY_A.q8_mortgage_change_pct}`),
    ck('q9_bp', near(n('q9'), KEY_A.q9_fedfunds_change_bp, 1), `got ${a.q9}, key ${KEY_A.q9_fedfunds_change_bp}`),
    ck('q10_declines', !!list && JSON.stringify(list) === JSON.stringify(KEY_A.q10_cpi_monthly_declines), `got ${JSON.stringify(a.q10)}, key ${JSON.stringify(KEY_A.q10_cpi_monthly_declines)}`),
    ck('q11_low', a.q11 === KEY_A.q11_sentiment_low_month, `got ${a.q11}, key ${KEY_A.q11_sentiment_low_month}`),
    ck('q12_core_headline', near(n('q12'), KEY_A.q12_core_minus_headline_2026_09_pp, 0.1), `got ${a.q12}, key ${KEY_A.q12_core_minus_headline_2026_09_pp}`),
  ];
}

// ── Test B: macroeconomic reasoning (real episode, Jul 2024 – Jun 2025) ─────
const B_FROM = '2024-07';
const B_TO = '2025-06';
const B_PROMPT = `You are preparing to commission a feature. Here is the evidence (US, monthly, FRED; 12-month changes computed from the published index levels):

${table(M, ['fedFunds', 'mortgage30', 'ust10', 'unemployment', 'sentiment', 'savingRate'], B_FROM, B_TO, {
  cpiY: { label: 'CPI 12-month change [%]', f: (d) => yoy(S.cpi, d), dp: 2 },
  coreY: { label: 'Core CPI 12-month change [%]', f: (d) => yoy(S.coreCpi, d), dp: 2 },
  aheY: { label: 'Average hourly earnings 12-month change [%]', f: (d) => yoy(S.ahe, d), dp: 2 },
  pceY: { label: 'Real consumer spending 12-month change [%]', f: (d) => yoy(S.realPce, d), dp: 2 },
})}

The pattern: inflation has been declining, policy interest rates remain elevated, consumer spending has held up, and consumer confidence has deteriorated sharply.

Investigate this pattern as a senior economics editor would before deciding what the story is. Do not narrate the table back; the reader can see it. Instead:
- What are the competing explanations for this combination, and what would distinguish them?
- Through which channels are elevated rates reaching (or failing to reach) households and the economy?
- Who is affected differently, and how?
- What does the conventional reading of this data get wrong or miss?
- What would you want to test next: state testable hypotheses and the specific additional datasets that would test them.

Write 700–1,100 words of clear prose (headings allowed). Be precise about what the evidence shows versus what you infer.`;

// ── Test C: quantitative reasoning with known properties ────────────────────
const ALL = months('2016-12', '2026-10');
const stat = (x: ReturnType<typeof paired>) => ({ r: r2(pearson(x.x, x.y)), n: x.n });
const spread = (d: string) => {
  const a = level(S.ust10)(d);
  const b = level(S.ust2)(d);
  return a === null || b === null ? null : a - b;
};
const C = {
  mortVs10yChg: stat(paired(ALL, diff(S.mortgage30), diff(S.ust10))),
  mortVsFfChg: stat(paired(ALL, diff(S.mortgage30), diff(S.fedFunds))),
  mortVsFfLvl: stat(paired(ALL, level(S.mortgage30), level(S.fedFunds))),
  cpiSpLvl: stat(paired(ALL, level(S.cpi), level(S.sp500))),
  cpiSpChg: stat(paired(ALL, pctChange(S.cpi), pctChange(S.sp500))),
  spYld1719: stat(paired(months('2017-01', '2019-12'), pctChange(S.sp500), diff(S.ust10))),
  spYld2224: stat(paired(months('2022-01', '2024-12'), pctChange(S.sp500), diff(S.ust10))),
  payPceAll: stat(paired(ALL, diff(S.payrolls), pctChange(S.realPce))),
  payPceExCovid: stat(paired(ALL.filter((d) => !(d >= '2020-03' && d <= '2020-07')), diff(S.payrolls), pctChange(S.realPce))),
  sentPce6: stat(paired(months('2026-05', '2026-10'), diff(S.sentiment), pctChange(S.realPce))),
  inverted: ALL.filter((d) => (spread(d) ?? 1) < 0),
};
const mm = (d: string) => `${d}: fed funds ${at(S.fedFunds, d)}%, 10-year ${at(S.ust10, d)}%, 30-year mortgage ${at(S.mortgage30, d)}%`;

const C_PROMPT = `Six analytical claims follow, each with evidence computed by our data desk from FRED monthly data (Pearson correlations; n = number of monthly observations). Assess each claim. The claims were written by different colleagues and some are wrong; do not assume a claim is sound because it is stated confidently. Use only the statistics given — do not invent new calculations, coefficients or significance levels.

C1. "The Fed's rate cuts work: it started cutting in September 2024 and mortgage rates came down."
Evidence: ${['2024-06', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01'].map(mm).join('; ')}. Correlation of monthly CHANGES, Dec 2016 – Oct 2026: mortgage rate vs 10-year yield r = ${C.mortVs10yChg.r} (n = ${C.mortVs10yChg.n}); mortgage rate vs fed funds r = ${C.mortVsFfChg.r} (n = ${C.mortVsFfChg.n}). Correlation of LEVELS, mortgage rate vs fed funds: r = ${C.mortVsFfLvl.r}.

C2. "Stocks are a proven inflation hedge: the S&P 500 and the CPI have a correlation of ${C.cpiSpLvl.r}."
Evidence: correlation of monthly LEVELS, Dec 2016 – Oct 2026: r = ${C.cpiSpLvl.r} (n = ${C.cpiSpLvl.n}). Correlation of monthly PERCENTAGE CHANGES over the same period: r = ${C.cpiSpChg.r} (n = ${C.cpiSpChg.n}).

C3. "The yield curve inverted, so a recession followed — the curve's record is perfect."
Evidence: the 10-year minus 2-year Treasury spread (monthly averages) was negative in every month from ${C.inverted[0]} to ${C.inverted.at(-1)} (${C.inverted.length} months). Unemployment: ${at(S.unemployment, '2023-04')}% in 2023-04, ${at(S.unemployment, '2024-08')}% in 2024-08, ${at(S.unemployment, '2025-11')}% in 2025-11, ${at(S.unemployment, '2026-10')}% in 2026-10. Nonfarm payrolls: ${at(S.payrolls, '2022-07')} thousand in 2022-07, ${at(S.payrolls, '2024-08')} thousand in 2024-08, ${at(S.payrolls, '2026-10')} thousand in 2026-10. This sample contains one inversion episode.

C4. "Rising bond yields are bad for stocks — that's a fixed rule."
Evidence: correlation between monthly S&P 500 returns and monthly changes in the 10-year yield: 2017-01 to 2019-12 r = ${C.spYld1719.r} (n = ${C.spYld1719.n}); 2022-01 to 2024-12 r = ${C.spYld2224.r} (n = ${C.spYld2224.n}).

C5. "Consumer sentiment doesn't matter for spending: over the last six months sentiment and spending moved in opposite directions."
Evidence: correlation between monthly changes in consumer sentiment and monthly % changes in real consumer spending, 2026-05 to 2026-10: r = ${C.sentPce6.r} (n = ${C.sentPce6.n}).

C6. "Jobs drive spending: monthly payroll changes and monthly real-spending growth have a correlation of ${C.payPceAll.r}."
Evidence: Dec 2016 – Oct 2026: r = ${C.payPceAll.r} (n = ${C.payPceAll.n}). Excluding March–July 2020: r = ${C.payPceExCovid.r} (n = ${C.payPceExCovid.n}).

For each claim: say whether it holds, what the evidence actually supports, what could be confounding the relationship, and what further analysis would settle it. Be concise (roughly 100–200 words per claim).
End with exactly one block, verdict per claim = "supported", "not supported" or "insufficient evidence":
<answers>{"C1": "...", "C2": "...", "C3": "...", "C4": "...", "C5": "...", "C6": "..."}</answers>`;

/** Expected verdicts; C6 accepts either "not supported" or "insufficient evidence" (an outlier-driven figure). */
const KEY_C: Record<string, string[]> = { C1: ['not supported'], C2: ['not supported'], C3: ['insufficient evidence', 'not supported'], C4: ['not supported'], C5: ['insufficient evidence', 'not supported'], C6: ['not supported', 'insufficient evidence'] };
const KNOWN_R = new Set(Object.values(C).flatMap((v) => (typeof v === 'object' && 'r' in v ? [Math.abs(v.r).toFixed(2)] : [])));

function gradeC(r: CallResult): Check[] {
  const a = answersOf(r);
  const out: Check[] = [...common(r)];
  if (!a) out.push(ck('answers_block', false, 'no parseable <answers> block'));
  else for (const k of Object.keys(KEY_C)) out.push(ck(`${k}_verdict`, KEY_C[k].includes(String(a[k]).toLowerCase().trim()), `got "${a[k]}", accept ${KEY_C[k].join(' | ')}`));
  // Fabricated statistics: coefficients not in the prompt, or p-values / t-stats / R² (none were supplied).
  const coeffs = [...r.content.matchAll(/\br\s*[=≈]\s*(-?0?\.\d+)/gi)].map((m) => Math.abs(Number(m[1])).toFixed(2)).filter((v) => !KNOWN_R.has(v));
  const sig = r.content.match(/\bp\s*[<=>]\s*0?\.\d+|\bt-stat|\bR²\s*=|\bR\^2\s*=|statistically significant at/gi) ?? [];
  out.push(ck('no_invented_coefficients', coeffs.length === 0, coeffs.length ? `new r values: ${coeffs.join(', ')}` : 'none'));
  out.push(ck('no_invented_significance', sig.length === 0, sig.length ? sig.join(', ') : 'none'));
  return out;
}

// ── Test D: market outlook (latest data, to Oct 2026) ──────────────────────
const D_FROM = '2025-10';
const D_TO = '2026-10';
const D_PROMPT = `Evidence (US, monthly, FRED; 12-month changes computed from published index levels; "n/a (missing)" = not published):

${table(M, ['fedFunds', 'ust2', 'ust10', 'mortgage30', 'unemployment', 'payrolls', 'sentiment', 'savingRate', 'sp500'], D_FROM, D_TO, {
  cpiY: { label: 'CPI 12-month change [%]', f: (d) => yoy(S.cpi, d), dp: 2 },
  coreY: { label: 'Core CPI 12-month change [%]', f: (d) => yoy(S.coreCpi, d), dp: 2 },
  aheY: { label: 'Average hourly earnings 12-month change [%]', f: (d) => yoy(S.ahe, d), dp: 2 },
  pceY: { label: 'Real consumer spending 12-month change [%]', f: (d) => yoy(S.realPce, d), dp: 2 },
})}

Write the Outlook for a feature on this economy (600–900 words). Provide:
1. A base case, an upside scenario and a downside scenario. For each: the conditions that would produce it, the economic transmission mechanism, and what it would mean for Treasuries, US equities, housing and mortgage borrowers, the US dollar and cash savers — differentiated by asset, not one generic statement.
2. For each scenario, the specific observable developments that would invalidate it.
3. The uncertainties that matter most.
Rules: these are conditional scenarios, not forecasts. No probabilities, odds or confidence levels, no price or rate targets, no investment advice. Use only figures from the table.`;

function gradeD(r: CallResult): Check[] {
  const t = r.content;
  const probs = probabilityLanguage(t);
  const targets = t.match(/\b(target|reach|hit|fall to|rise to)\s+(of\s+)?\$?\d[\d,.]*\s?(%|points|bp)?/gi) ?? [];
  return [
    ...common(r),
    ck('three_scenarios', /base/i.test(t) && /upside/i.test(t) && /downside/i.test(t)),
    ck('invalidation_stated', (t.match(/invalidat|would (be )?(wrong|disprove|undermine)|rule[sd]? out|break (this|the) (case|scenario)/gi) ?? []).length >= 3, 'needs ≥3 invalidation statements'),
    ck('no_probabilities', probs.length === 0, probs.join('; ') || 'none'),
    ck('no_targets', targets.length === 0, targets.slice(0, 5).join('; ') || 'none'),
    ck('assets_covered', ['treasur', 'equit|stock', 'mortgage|housing', 'dollar', 'saver|cash'].every((p) => new RegExp(p, 'i').test(t))),
  ];
}

export const ANSWER_KEYS = { A: KEY_A, C: { verdicts: KEY_C, stats: C } };

const mk = (id: string, category: string, user: string, maxTokens: number, evaluate: Case['evaluate'], temperature = 0.3): Case => ({
  id,
  suite: id[0],
  category,
  subject: 'households-feel-poorer',
  fixtureVersion: `${ANALYSIS_VERSION}+macro-us@${M.retrievedAt.slice(0, 10)}`,
  messages: [
    { role: 'system', content: ANALYST_SYSTEM },
    { role: 'user', content: user },
  ],
  params: { max_tokens: maxTokens, temperature, top_p: 0.95 },
  stream: true,
  timeoutMs: 600_000,
  evaluate,
});

/** Thinking configs get a larger budget: reasoning tokens share max_tokens (D-009). */
export function analysisCases(): Case[] {
  return [
    mk('A1-data-interpretation', 'financial data interpretation', A_PROMPT, 4000, gradeA, 0.2),
    mk('B1-macro-reasoning', 'macroeconomic reasoning', B_PROMPT, 4000, (r) => common(r)),
    mk('C1-quant-claims', 'quantitative analytics', C_PROMPT, 4500, gradeC, 0.2),
    mk('D1-market-outlook', 'market outlook', D_PROMPT, 4000, gradeD),
  ];
}
