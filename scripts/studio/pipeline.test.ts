// Deterministic tests for the Phase 2B generation engine, with mocked
// providers and a scripted LLM. (Live-provider integration runs are separate:
// scripts/studio/live-run.mjs and the studio UI.) The synthetic series below
// are TEST FIXTURES ONLY and never reach a published page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { z } from 'zod';
import { MemoryStore } from '../../lib/studio/pipeline/memory-store.ts';
import { runStep } from '../../lib/studio/pipeline/runner.ts';
import { assembleArticle, setPath } from '../../lib/studio/pipeline/stages.ts';
import type { Deps, StageContext } from '../../lib/studio/pipeline/types.ts';
import { LlmError, type Llm, type LlmRequest } from '../../lib/studio/llm.ts';
import type { DataProvider, SearchProvider, SeriesMeta } from '../../lib/studio/providers/types.ts';
import { StoryBrief, SECTION_ORDER, type SeshatArticle } from '../../lib/studio/schema.ts';
import { validateArticle } from '../../lib/studio/validate.ts';
import { findBareNumbers } from '../../lib/studio/numbers.ts';
import { buildDataProducts, deriveSeries, type Dataset } from '../../lib/studio/facts.ts';
import { unitInfo } from '../../lib/studio/units.ts';
import { classifySource, figureInQuote, quoteAppears } from '../../lib/studio/sources.ts';
import { resolveTokens } from '../../lib/content/tokens.ts';

const TODAY = '2026-11-26';

// ── Fakes ────────────────────────────────────────────────────────────────
function synthetic(start: string, end: string, freq: 'daily' | 'monthly', f: (i: number) => number | null) {
  const out: { date: string; value: number | null }[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; d.toISOString().slice(0, 10) <= end; i++) {
    out.push({ date: d.toISOString().slice(0, 10), value: f(i) });
    if (freq === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const META: Record<string, SeriesMeta> = {
  FX1: { provider: 'fred', id: 'FX1', title: 'Test currency per dollar', units: 'Japanese Yen to One U.S. Dollar', frequency: 'Daily', seasonalAdjustment: 'Not Seasonally Adjusted', observationStart: '2014-01-01', observationEnd: '2026-11-20', notes: '', sourceUrl: 'https://fred.stlouisfed.org/series/FX1', popularity: 80 },
  RA: { provider: 'fred', id: 'RA', title: 'Test rate A', units: 'Percent', frequency: 'Monthly', seasonalAdjustment: null, observationStart: '2014-01-01', observationEnd: '2026-10-01', notes: '', sourceUrl: 'https://fred.stlouisfed.org/series/RA', popularity: 70 },
  RB: { provider: 'fred', id: 'RB', title: 'Test rate B', units: 'Percent', frequency: 'Monthly', seasonalAdjustment: null, observationStart: '2014-01-01', observationEnd: '2026-10-01', notes: '', sourceUrl: 'https://fred.stlouisfed.org/series/RB', popularity: 60 },
};
const OBS: Record<string, ReturnType<typeof synthetic>> = {
  FX1: synthetic('2014-01-01', '2026-11-20', 'daily', (i) => (i % 97 === 5 ? null : 100 + i * 0.01)),
  RA: synthetic('2014-01-01', '2026-10-01', 'monthly', (i) => 1 + i * 0.02),
  RB: synthetic('2014-01-01', '2026-10-01', 'monthly', (i) => 0.1 + i * 0.001),
};

function fakeData(calls: string[]): DataProvider {
  return {
    id: 'fred', name: 'FRED, Federal Reserve Bank of St. Louis', short: 'FRED', enabled: true,
    async search() { calls.push('search'); return Object.values(META); },
    async meta(id) { return META[id] ?? null; },
    async fetch(id) { calls.push(`fetch:${id}`); return { meta: META[id], observations: OBS[id], transformations: [], retrievedAt: '2026-11-26T00:00:00Z', sha256: 'x', calls: 1, ms: 1 }; },
  };
}

const SOURCE_TEXT = 'The central bank held its policy rate on Tuesday. Officials said the cut amounted to 2.2 million barrels per day of output, according to the statement.';
function fakeSearch(opts: { fail?: boolean } = {}): SearchProvider {
  return {
    name: 'FakeSearch',
    async search(q) {
      if (opts.fail) throw Object.assign(new Error('search down'), { retryable: true });
      return { results: [
        { url: 'https://www.federalreserve.gov/test-release', title: `Release for ${q}`, content: SOURCE_TEXT, score: 0.9, publishedDate: '2026-11-01' },
        { url: 'https://www.reuters.com/test-story', title: 'Story', content: 'Markets moved after the decision.', score: 0.8, publishedDate: '2026-11-02' },
      ], credits: 1, ms: 1 };
    },
    async extract(urls) { return { results: urls.map((url) => ({ url, content: SOURCE_TEXT })), credits: 1, ms: 1 }; },
  };
}

const attention = { required: false, reasons: [] };
const scripted: Record<string, () => unknown> = {
  plan: () => ({ workingTitle: 'Test story', section: 'markets', centralQuestion: 'Why did the test currency weaken?', angle: 'Rate gap', whyReadersCare: 'Prices', questions: ['Q1?', 'Q2?'], searches: [{ query: 'q1', purpose: 'p', recent: true }, { query: 'q2', purpose: 'p', recent: false }, { query: 'q3', purpose: 'p', recent: false }], dataNeeds: [{ need: 'exchange rate', why: 'core', searchText: 'yen dollar' }, { need: 'rates', why: 'gap', searchText: 'rates' }], storyboardConcern: '' }),
  select: () => ({ series: [{ candidate: 'C1', key: 'fx', label: 'Currency per dollar', reason: 'r' }, { candidate: 'C2', key: 'rateA', label: 'Rate A', reason: 'r' }, { candidate: 'C3', key: 'rateB', label: 'Rate B', reason: 'r' }], derived: [{ key: 'gap', op: 'difference', inputs: ['rateA', 'rateB'], label: 'Rate gap', reason: 'r' }], charts: [{ id: 'fxChart', seriesKeys: ['fx'], from: '2021-01-01', purpose: 'p' }, { id: 'gapChart', seriesKeys: ['rateA', 'rateB'], from: '2019-01-01', purpose: 'p' }, { id: 'badChart', seriesKeys: ['fx', 'rateA'], from: '2019-01-01', purpose: 'mixed units' }], unmetNeeds: [] }),
  synthesize: () => ({ thesis: 'The gap drove the move.', findings: [{ claim: 'Bank held', kind: 'documented', sourceRefs: ['S1'], quote: 'The central bank held its policy rate on Tuesday.' }, { claim: 'Invented', kind: 'context', sourceRefs: ['S2'], quote: 'This sentence is not in any source at all.' }], sourceFigures: [{ key: 'cut', figure: '2.2 million barrels per day', quote: 'Officials said the cut amounted to 2.2 million barrels per day of output', sourceRef: 'S1', about: 'cut size' }, { key: 'fake', figure: '9.9 million', quote: 'Officials said the cut amounted to 2.2 million barrels per day of output', sourceRef: 'S1', about: 'mismatch' }], conflicts: [], gaps: [], sectionSupport: { story: 'supported', macro: 'supported', analytics: 'supported', outlook: 'thin' } }),
  story: () => ({ kicker: 'Currencies', headline: 'A test headline', dek: 'The currency hit {fxLatest} as the gap reached {gapLatest}.', keyPoints: ['One {fxChg1y}', 'Two', 'Three'], blocks: [
    { type: 'p', text: 'The currency stood at {fxLatest} on {fxLatest.date}.' },
    { type: 'p', text: 'It was {fxYearAgo} a year earlier, a change of {fxChg1y}.' },
    { type: 'p', text: 'Producers announced a cut of {srcCut}, and the move reached 3.5% in a week.' },
    { type: 'chart', chartId: 'fxChart', question: 'How far has it fallen?', takeaway: 'It is at {fxLatest}.' },
  ], attention }),
  macro_analytics: () => ({
    macro: { title: 'The numbers', intro: 'Rates diverged.', indicators: [{ key: 'fx', note: 'Core' }, { key: 'nope', note: 'Missing' }], charts: [{ chartId: 'gapChart', question: 'How wide is the gap?', takeaway: 'Rate A is {rateALatest} but the currency is {fxLatest}.' }, { chartId: 'badChart', question: 'Mixed', takeaway: 'x' }], explainers: [{ title: 'Gap', text: 'The gap is {gapLatest}.', evidence: 'documented' }, { title: 'No data', text: 'Rates matter.', evidence: 'documented' }], attention },
    analytics: { title: 'Why', intro: 'Mechanism.', chain: { title: 'Chain', steps: [{ title: 'Gap', text: 'Wider gap {gapLatest}', evidence: 'documented' }, { title: 'Flows', text: 'Capital moves.', evidence: 'context' }] }, charts: [], comparisons: [], implications: { title: 'Implications', intro: 'Assets.', items: [{ asset: 'Stocks', icon: 'stocks', shows: 'Exporters gain.', showsEvidence: 'context', couldMean: 'Maybe.' }] }, attention },
  }),
  outlook: () => ({ title: 'Next', intro: 'Paths.', scenarios: [
    { key: 'a', name: 'Gap persists', role: 'central', summary: 's', conditions: ['c'], whyItMatters: 'w', assets: [{ asset: 'FX', effect: 'e' }], watch: ['Rate A'], uncertainties: ['u'] },
    { key: 'b', name: 'Gap closes', role: 'alternative', summary: 's', conditions: ['c'], whyItMatters: 'w', assets: [{ asset: 'FX', effect: 'e' }], watch: ['Rate B'], uncertainties: ['u'] },
  ], attention }),
  review: () => ({ problems: [{ path: 'story.blocks[1].text', problem: 'Direction of the change is misdescribed.', kind: 'contradicts-data' }, { path: 'story.nope', problem: 'invalid path', kind: 'other' }] }),
  repair: () => ({ fixes: [{ path: 'story.blocks[2].text', text: 'Producers announced a cut of {srcCut}, and the currency moved sharply within a week.' }, { path: 'story.blocks[1].text', text: 'A year earlier it was {fxYearAgo}; the change since is {fxChg1y}.' }] }),
};

function fakeLlm(calls: string[], failOnce: Set<string> = new Set()): Llm {
  return {
    model: 'fake-model',
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req.stage);
      if (failOnce.has(req.stage)) {
        failOnce.delete(req.stage);
        throw new LlmError(`${req.stage}: model output failed validation after 2 attempts`, true, { promptTokens: 10, completionTokens: 5 });
      }
      const data = (req.schema as z.ZodType<T>).parse(scripted[req.stage]());
      return { data, usage: { promptTokens: 100, completionTokens: 50 }, ms: 1, attempts: 1, model: 'fake-model' };
    },
  };
}

function setup(opts: { failSearch?: boolean; failOnce?: string[] } = {}) {
  const store = new MemoryStore();
  const llmCalls: string[] = [];
  const dataCalls: string[] = [];
  const deps: Deps = { store, llm: fakeLlm(llmCalls, new Set(opts.failOnce)), search: fakeSearch({ fail: opts.failSearch }), data: [fakeData(dataCalls)], today: () => TODAY, now: () => new Date('2026-11-26T12:00:00Z') };
  const brief = StoryBrief.parse({ prompt: 'Why is the test currency weakening, and what does it mean for investors?' });
  const { articleId, jobId } = store.createArticleAndJob({ working_title: 'Test', brief });
  return { store, deps, articleId, jobId, llmCalls, dataCalls };
}

async function runToEnd(deps: Deps, jobId: string, max = 40) {
  for (let i = 0; i < max; i++) {
    const r = await runStep(deps, jobId);
    if (r.kind === 'idle') return r.job!;
  }
  throw new Error('did not finish');
}

// ── End-to-end (mocked) ──────────────────────────────────────────────────
test('pipeline produces a validated four-section draft from mocked providers', async () => {
  const { store, deps, articleId, jobId, llmCalls } = setup();
  const job = await runToEnd(deps, jobId);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.stage, 'done');
  const art = (await store.getArticle(articleId))!;
  const c = art.content as SeshatArticle;
  assert.deepEqual(Object.keys(c).filter((k) => (SECTION_ORDER as readonly string[]).includes(k)), [...SECTION_ORDER]);
  assert.equal(art.revision, 1);
  assert.equal(store.revisions[0].origin, 'generated');
  // Repair replaced the bare "3.5%"; no bare numbers remain in the story.
  assert.ok(!JSON.stringify(c.story).includes('3.5%'));
  assert.ok(!c.validation.issues.some((i) => i.code === 'bare-number' && i.section === 'story'));
  // Verified source figure became a fact; the mismatched one was discarded.
  assert.equal(c.data.facts.srcCut?.text, '2.2 million barrels per day');
  assert.equal(c.data.facts.srcFake, undefined);
  // Invalid references removed and flagged; mixed-unit chart never built.
  assert.ok(!c.macro.indicators.some((i) => i.key === 'nope'));
  assert.ok(!c.macro.charts.some((x) => x.chartId === 'badChart'));
  assert.ok(job.warnings.some((w) => /different units/.test(w.message)));
  // Chart caption citing an unplotted series is flagged.
  assert.ok(c.validation.issues.some((i) => i.code === 'chart-claim-mismatch'));
  // "In the data" claim without data is downgraded and noted; the finding with a fabricated quote is unverified.
  assert.ok(c.validation.issues.some((i) => i.code === 'evidence-qualified'));
  assert.equal(c.macro.explainers.find((e) => e.title === 'No data')?.evidence, 'context');
  assert.equal(c.evidence.findings.find((f) => f.claim === 'Invented')?.quoteVerified, false);
  // Every token resolves with the stored data.
  const ctx = { facts: c.data.facts as never, dates: c.data.dates as never };
  assert.doesNotThrow(() => resolveTokens(c.story.dek, ctx));
  // Each LLM stage ran exactly once; no parallel/duplicate calls.
  assert.deepEqual(llmCalls, ['plan', 'select', 'synthesize', 'story', 'macro_analytics', 'outlook', 'review', 'repair']);
  assert.ok(job.metrics.finishedAt);
  // Fact-check findings reach the repair stage (valid paths only) and are surfaced to the editor.
  assert.equal(c.story.blocks[1].type === 'p' && c.story.blocks[1].text, 'A year earlier it was {fxYearAgo}; the change since is {fxChg1y}.');
  assert.equal(c.validation.issues.filter((i) => i.code === 'review-revised').length, 1);
});

test('invalid LLM output fails only that stage; retry resumes without re-running earlier stages', async () => {
  const { store, deps, jobId, llmCalls, dataCalls } = setup({ failOnce: ['story'] });
  const job = await runToEnd(deps, jobId);
  assert.equal(job.status, 'succeeded');
  assert.equal(llmCalls.filter((s) => s === 'story').length, 2);
  assert.equal(llmCalls.filter((s) => s === 'plan').length, 1);
  assert.equal(dataCalls.filter((s) => s.startsWith('fetch:')).length, 3); // no duplicate data retrieval
  assert.ok(store.runs.some((r) => r.stage === 'story' && r.status === 'failed'));
});

test('persistent search failure fails the job after 3 attempts and preserves a flagged partial draft', async () => {
  const { store, deps, articleId, jobId } = setup({ failSearch: true });
  const job = await runToEnd(deps, jobId);
  assert.equal(job.status, 'failed');
  assert.equal(job.error?.stage, 'search');
  assert.equal(job.attempts.search, 3);
  const art = (await store.getArticle(articleId))!;
  assert.equal(art.status, 'generation_failed');
  const c = art.content as SeshatArticle;
  for (const s of SECTION_ORDER) assert.equal(c[s].attention.required, true, `${s} flagged`);
});

test('job lease prevents concurrent steps; one active job at a time', async () => {
  const { store, jobId } = setup();
  assert.ok(await store.claimJob(jobId, 290));
  assert.equal(await store.claimJob(jobId, 290), null);
  assert.throws(() => store.createArticleAndJob({ working_title: 'x', brief: { prompt: 'another story prompt here please' } }), /one_active/);
});

// ── Units, transforms, facts ─────────────────────────────────────────────
const ds = (key: string, units: string, frequency: string, obs: { date: string; value: number | null }[]): Dataset => ({ key, provider: 'FRED', providerShort: 'FRED', seriesId: key.toUpperCase(), name: key, units, frequency, seasonalAdjustment: null, definition: '', sourceUrl: 'https://fred.stlouisfed.org/', retrievedAt: '2026-11-26T00:00:00Z', transformations: [], observations: obs, sha256: 'x' });

test('units: index levels are never treated as rates; incompatible operations are refused', () => {
  assert.equal(unitInfo('Index 1982-1984=100').kind, 'index');
  assert.equal(unitInfo('Percent').kind, 'rate');
  assert.equal(unitInfo('Dollars per Barrel').display.prefix, '$');
  const cpi = ds('cpi', 'Index 1982-1984=100', 'Monthly', synthetic('2020-01-01', '2026-10-01', 'monthly', (i) => 100 + i));
  const rate = ds('rate', 'Percent', 'Monthly', synthetic('2020-01-01', '2026-10-01', 'monthly', () => 2));
  const { series, issues } = deriveSeries([cpi, rate], [
    { key: 'cpiYoy', op: 'yoy', of: 'cpi', label: 'Inflation' },
    { key: 'rateYoy', op: 'yoy', of: 'rate', label: 'Nonsense' },
    { key: 'mixed', op: 'difference', a: 'rate', b: 'cpi', label: 'Nonsense' },
  ]);
  assert.ok(series.cpiYoy);
  assert.ok(!series.rateYoy && !series.mixed);
  assert.equal(issues.length, 2);
  const p = buildDataProducts([cpi], [], []);
  assert.equal(p.facts.cpiLatest.format, 'num'); // index level, not "%"
});

test('facts: change of a rate is in percentage points, of a level in percent; gaps are not filled', () => {
  const fx = ds('fx', 'Japanese Yen to One U.S. Dollar', 'Daily', [{ date: '2025-11-20', value: 150 }, { date: '2026-05-01', value: null }, { date: '2026-11-20', value: 165 }]);
  const r = ds('r', 'Percent', 'Monthly', [{ date: '2025-10-01', value: 4 }, { date: '2026-10-01', value: 3.5 }]);
  const p = buildDataProducts([fx, r], [], []);
  assert.equal(p.facts.fxChg1y.format, 'pct');
  assert.equal(p.facts.fxChg1y.value, 10);
  assert.equal(p.facts.rChg1y.format, 'pp');
  assert.equal(p.facts.rChg1y.value, -0.5);
  assert.equal(resolveTokens('{fxLatest}', { facts: p.facts, dates: p.dates }), '¥165.00');
});

// ── Validation ───────────────────────────────────────────────────────────
test('number scanner flags untokenized figures but allows years and maturities', () => {
  assert.deepEqual(findBareNumbers('Since 2008 the 10-year yield and the 1990s boom; {x} and S&P 500 index.'), []);
  const found = findBareNumbers('Yields hit 4.5% and oil fell $12 to 70.25, a cut of two million barrels, or 25 basis points.').map((b) => b.match);
  assert.ok(found.includes('4.5%'));
  assert.ok(found.some((f) => f.startsWith('$12')));
  assert.ok(found.includes('70.25'));
  assert.ok(found.includes('25 basis points'));
});

test('validator detects unknown tokens and facts that do not match recomputation', () => {
  const { deps, jobId, store } = setup();
  const ctx = { deps, job: { id: jobId, created_at: '2026-11-26T00:00:00Z' }, article: { brief: { prompt: 'x' }, working_title: 'T' }, outputs: {}, warn() {}, metric() {} } as unknown as StageContext;
  void store;
  const a = assembleArticle(ctx);
  a.story.dek = 'Rates hit {nope}.';
  a.data.facts.xLatest = { value: 1, format: 'pct', decimals: 2, date: '2026-01-01', seriesIds: ['X'], method: 'm' };
  const v = validateArticle(a, { today: TODAY, recomputedFacts: { xLatest: { value: 2, format: 'pct', decimals: 2, date: '2026-01-01', seriesIds: ['X'], method: 'm' } } });
  assert.ok(v.issues.some((i) => i.code === 'unknown-token'));
  assert.ok(v.issues.some((i) => i.code === 'fact-mismatch'));
  assert.equal(v.ok, false);
});

test('schema rejects an empty or trivial prompt and a fifth section', () => {
  assert.equal(StoryBrief.safeParse({ prompt: '' }).success, false);
  assert.equal(StoryBrief.safeParse({ prompt: 'yen?' }).success, false);
  const { deps, jobId } = setup();
  const ctx = { deps, job: { id: jobId, created_at: '2026-11-26T00:00:00Z' }, article: { brief: { prompt: 'x' }, working_title: 'T' }, outputs: {}, warn() {}, metric() {} } as unknown as StageContext;
  const a = assembleArticle(ctx) as SeshatArticle & { bonus?: unknown };
  assert.equal(validateArticle(a, { today: TODAY }).article !== undefined, true);
  a.bonus = { title: 'A fifth section' };
  assert.equal(validateArticle(a, { today: TODAY }).ok, false);
  delete a.bonus;
  a.schemaVersion = 2 as 1;
  assert.equal(validateArticle(a, { today: TODAY }).ok, false);
});

test('sources: authority classification and verbatim quote checks', () => {
  assert.equal(classifySource('https://www.boj.or.jp/en/mopo/'), 'primary');
  assert.equal(classifySource('https://www.eia.gov/petroleum/'), 'primary');
  assert.equal(classifySource('https://www.reuters.com/markets/'), 'journalism');
  assert.equal(classifySource('https://randomblog.example.com/'), 'other');
  assert.ok(quoteAppears('the  central bank held its policy rate', SOURCE_TEXT));
  assert.ok(!quoteAppears('the central bank cut its policy rate', SOURCE_TEXT));
  assert.ok(figureInQuote('2.2 million', 'a cut of 2.2 million barrels'));
  assert.ok(!figureInQuote('2.3 million', 'a cut of 2.2 million barrels'));
});

test('setPath only replaces existing string leaves', () => {
  const o = { a: { b: [{ text: 'x' }] } };
  assert.equal(setPath(o, 'a.b[0].text', 'y'), true);
  assert.equal(o.a.b[0].text, 'y');
  assert.equal(setPath(o, 'a.b[0].nope', 'y'), false);
  assert.equal(setPath(o, 'a.b', 'y'), false);
});

// ── Regressions found in live runs ───────────────────────────────────────
import { fxQuote } from '../../lib/studio/units.ts';
import { findUnsupportedSuperlatives, findCliches } from '../../lib/studio/numbers.ts';

test('FX: a rise in yen-per-dollar is reported as a fall in the value of the yen', () => {
  assert.deepEqual(fxQuote('Japanese Yen to  1 U.S. $')?.quote, 'Japanese Yen');
  assert.equal(fxQuote('Japanese Yen to One U.S. Dollar')?.quoteWord, 'Yen');
  assert.equal(fxQuote('Percent'), null);
  const fx = ds('usdjpy', 'Japanese Yen to One U.S. Dollar', 'Daily', [{ date: '2021-11-19', value: 113.81 }, { date: '2025-11-20', value: 157.41 }, { date: '2026-11-20', value: 158.76 }]);
  const p = buildDataProducts([fx], [], []);
  assert.equal(p.facts.usdjpyChg5y.value, 39.5); // more yen per dollar…
  assert.match(p.facts.usdjpyChg5y.method, /RISE means the Japanese Yen WEAKENED/);
  assert.equal(p.facts.usdjpyValueOfYenChg5y.value, -28.3); // …= the yen lost 28.3% of its value
  assert.ok(p.observations.some((o) => /HIGHER number means a WEAKER Japanese Yen/.test(o)));
});

test('superlatives need an extreme-value fact in the same sentence', () => {
  assert.deepEqual(findUnsupportedSuperlatives('The yen fell to {usdjpyLatest}, a five-year low.'), ['five-year low']);
  assert.deepEqual(findUnsupportedSuperlatives('It touched {usdjpyHigh5y} in July, the highest in the window.'), []);
  assert.deepEqual(findUnsupportedSuperlatives('Rates are the highest since {fedFundsHighestSince}.'), []);
  assert.deepEqual(findUnsupportedSuperlatives('The gap remains far above its five-year average.'), ['above its five-year average']);
  assert.deepEqual(findCliches('Investors navigating the market.'), ['navigating']);
});

test('highest-since / lowest-since dates are computed only for gaps of six months or more', () => {
  const s = ds('r', 'Percent', 'Monthly', [
    { date: '2020-01-01', value: 5 }, { date: '2021-01-01', value: 2 }, { date: '2025-06-01', value: 3 }, { date: '2026-10-01', value: 4.5 },
  ]);
  const p = buildDataProducts([s], [], []);
  assert.equal(p.dates.rHighestSince.date, '2020-01-01');
  assert.equal(p.dates.rLowestSince.date, '2025-06-01'); // last earlier value at or below 4.5
});

import { dedupeUnits } from '../../lib/studio/pipeline/stages.ts';
test('repeated units around level tokens are removed', () => {
  const a = { story: { dek: 'Brent hit {brentLatest} a barrel, or ${brentLatest}.' }, macro: {}, analytics: {}, outlook: {}, data: { facts: { brentLatest: { value: 91.8, format: 'level', decimals: 2, unit: { prefix: '$', suffix: ' a barrel' }, seriesIds: [], method: '' } } } };
  dedupeUnits(a as never);
  assert.equal(a.story.dek, 'Brent hit {brentLatest}, or {brentLatest}.');
});

test('event/flow series (mostly zeros) get no percent changes and never produce NaN facts', () => {
  const iv = ds('iv', '100 Million Yen', 'Daily', [{ date: '2025-01-01', value: 0 }, { date: '2025-11-20', value: 0 }, { date: '2026-05-01', value: 5000 }, { date: '2026-11-20', value: 0 }]);
  const p = buildDataProducts([iv], [], []);
  assert.equal(p.facts.ivChg1y, undefined);
  assert.ok(Object.values(p.facts).every((f) => Number.isFinite(f.value)));
  assert.ok(p.issues.some((i) => /mostly zeros/.test(i)));
  assert.equal(p.indicators[0].change, undefined);
});
