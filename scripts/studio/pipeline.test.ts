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
    async fetch(id, start) { calls.push(`fetch:${id}:${start}`); return { meta: META[id], observations: OBS[id], transformations: [], retrievedAt: '2026-11-26T00:00:00Z', sha256: 'x', calls: 1, ms: 1 }; },
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
  plan: () => ({ workingTitle: 'Test story', section: 'markets', centralQuestion: 'Why did the test currency weaken?', angle: 'Rate gap', whyReadersCare: 'Prices', questions: ['Q1?', 'Q2?'], searches: [{ query: 'q1', purpose: 'p', recent: true }, { query: 'q2', purpose: 'p', recent: false }, { query: 'q3', purpose: 'p', recent: false }], dataNeeds: [{ need: 'exchange rate', why: 'core', searchText: 'yen dollar' }, { need: 'rates', why: 'gap', searchText: 'rates' }], storyboardConcern: '', counterChecks: [{ premise: 'The currency is weak', contradictingEvidence: 'periods when it strengthened', searchText: 'yen dollar' }] }),
  select: () => ({ series: [{ candidate: 'C1', key: 'fx', label: 'Currency per dollar', reason: 'r' }, { candidate: 'C2', key: 'rateA', label: 'Rate A', reason: 'r' }, { candidate: 'C3', key: 'rateB', label: 'Rate B', reason: 'r' }], derived: [{ key: 'gap', op: 'difference', inputs: ['rateA', 'rateB'], label: 'Rate gap', reason: 'r' }], charts: [{ id: 'fxChart', seriesKeys: ['fx'], from: '2021-01-01', purpose: 'p' }, { id: 'gapChart', seriesKeys: ['rateA', 'rateB'], from: '2019-01-01', purpose: 'p' }, { id: 'badChart', seriesKeys: ['fx', 'rateA'], from: '2019-01-01', purpose: 'mixed units' }], unmetNeeds: [] }),
  synthesize: () => ({ thesis: 'The gap drove the move.', findings: [{ claim: 'Bank held', kind: 'documented', sourceRefs: ['S1'], quote: 'The central bank held its policy rate on Tuesday.' }, { claim: 'Invented', kind: 'context', sourceRefs: ['S2'], quote: 'This sentence is not in any source at all.' }], sourceFigures: [{ key: 'cut', figure: '2.2 million barrels per day', quote: 'Officials said the cut amounted to 2.2 million barrels per day of output', sourceRef: 'S1', about: 'cut size', kind: 'change', measure: 'flow', unit: 'barrels per day', denominator: 'day', temporal: 'historical', period: '' }, { key: 'fake', figure: '9.9 million', quote: 'Officials said the cut amounted to 2.2 million barrels per day of output', sourceRef: 'S1', about: 'mismatch', kind: 'change', measure: 'flow', unit: 'barrels per day', denominator: 'day', temporal: 'historical', period: '' }], conflicts: [], gaps: [], sectionSupport: { story: 'supported', macro: 'supported', analytics: 'supported', outlook: 'thin' }, authorArgument: { status: 'not-provided', note: '' } }),
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

function fakeLlm(calls: string[], failOnce: Set<string> = new Set(), prompts: Record<string, string> = {}): Llm {
  return {
    model: 'fake-model',
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req.stage);
      prompts[req.stage] = req.user;
      if (failOnce.has(req.stage)) {
        failOnce.delete(req.stage);
        throw new LlmError(`${req.stage}: model output failed validation after 2 attempts`, true, { promptTokens: 10, completionTokens: 5 });
      }
      const data = (req.schema as z.ZodType<T>).parse(scripted[req.stage]());
      return { data, usage: { promptTokens: 100, completionTokens: 50 }, ms: 1, attempts: 1, model: 'fake-model' };
    },
  };
}

function setup(opts: { failSearch?: boolean; failOnce?: string[]; brief?: Record<string, string> } = {}) {
  const store = new MemoryStore();
  const llmCalls: string[] = [];
  const dataCalls: string[] = [];
  const prompts: Record<string, string> = {};
  const deps: Deps = { store, llm: fakeLlm(llmCalls, new Set(opts.failOnce), prompts), search: fakeSearch({ fail: opts.failSearch }), data: [fakeData(dataCalls)], keyFingerprints: { arli: 'arlikey00001', tavily: 'tavkey000001', fred: 'fredkey00001' }, today: () => TODAY, now: () => new Date('2026-11-26T12:00:00Z') };
  const brief = StoryBrief.parse({ prompt: 'Why is the test currency weakening, and what does it mean for investors?', ...opts.brief });
  const { articleId, jobId } = store.createArticleAndJob({ working_title: 'Test', brief });
  return { store, deps, articleId, jobId, llmCalls, dataCalls, prompts };
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
  // Full history is retrieved exactly once per series (screening uses a short recent window).
  assert.equal(dataCalls.filter((s) => s.startsWith('fetch:') && s.endsWith(':2014-01-01')).length, 3);
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

test('usage ledger records tokens, credits and calls per service and key fingerprint', async () => {
  const { store, deps, jobId } = setup();
  await runToEnd(deps, jobId);
  const by = (s: string) => store.usage.filter((u) => u.service === s);
  assert.equal(by('arli').length, 8); // one row per LLM stage
  assert.ok(by('arli').every((u) => u.key_fingerprint === 'arlikey00001' && u.model === 'fake-model' && u.prompt_tokens === 100));
  assert.equal(by('fred').reduce((a, u) => a + u.calls, 0) > 0, true);
  assert.equal(by('fred')[0].key_fingerprint, 'fredkey00001');
});

import { fixSignWords } from '../../lib/studio/pipeline/stages.ts';
test('"fell by {x}" with a negative x uses the magnitude form; positive values untouched', () => {
  const a = { story: { dek: 'Starts have fallen {s} and rose {r}; prices declined by {s}.' }, macro: {}, analytics: {}, outlook: {}, data: { facts: { s: { value: -17.5, format: 'pct', decimals: 1, seriesIds: [], method: '' }, r: { value: 3, format: 'pct', decimals: 1, seriesIds: [], method: '' } } } };
  fixSignWords(a as never);
  assert.equal(a.story.dek, 'Starts have fallen {s:abs} and rose {r}; prices declined by {s:abs}.');
  assert.equal(resolveTokens('{s:abs}', { facts: a.data.facts as never, dates: {} }), '17.5%');
});

test('annual series use year precision; large dollar amounts have no cents; "all-time" is always flagged', () => {
  const inc = ds('inc', 'Current Dollars', 'Annual', [{ date: '2020-01-01', value: 80000 }, { date: '2025-01-01', value: 87460 }]);
  const p = buildDataProducts([inc], [], []);
  assert.equal(resolveTokens('{incLatest} in {incLatest.date}', { facts: p.facts, dates: p.dates }), '$87,460 in 2025');
  assert.deepEqual(findUnsupportedSuperlatives('Prices hit {cpHighAll}, an all-time high.'), ['all-time']);
});

test('a repair rewrite that breaks field limits is discarded, not fatal', async () => {
  const { store, deps, jobId, articleId } = setup();
  const original = scripted.repair;
  const originalReview = scripted.review;
  scripted.review = () => ({ problems: [{ path: 'outlook.scenarios[0].watch[0]', problem: 'Too vague.', kind: 'other' }, { path: 'story.blocks[2].text', problem: 'x', kind: 'other' }] });
  scripted.repair = () => ({ fixes: [{ path: 'outlook.scenarios[0].watch[0]', text: 'x'.repeat(500) }, { path: 'story.blocks[2].text', text: 'Producers announced a cut of {srcCut}.' }] });
  try {
    const job = await runToEnd(deps, jobId);
    assert.equal(job.status, 'succeeded', JSON.stringify(job.error));
    const c = (await store.getArticle(articleId))!.content as SeshatArticle;
    assert.equal(c.outlook.scenarios[0].watch[0], 'Rate A'); // original kept
    assert.equal((c.story.blocks[2] as { text: string }).text, 'Producers announced a cut of {srcCut}.'); // valid fix applied
    assert.ok(job.warnings.some((w) => /broke the field's limits/.test(w.message)));
  } finally {
    scripted.repair = original;
    scripted.review = originalReview;
  }
});

test('a superlative citing the date of an extreme-value fact is supported', () => {
  assert.deepEqual(findUnsupportedSuperlatives('Supply is the highest since {supplyHigh1y.date}.'), []);
});

test('words repeated around a quoted source figure are removed', () => {
  const a = { story: { dek: 'The queue holds over {q} gigawatts; it is {q}.' }, macro: {}, analytics: {}, outlook: {}, data: { facts: { q: { value: 220, format: 'text', text: 'over 220 gigawatts', decimals: 0, seriesIds: [], sourceRefs: ['S1'], method: '' } } } };
  dedupeUnits(a as never);
  assert.equal(a.story.dek, 'The queue holds {q}; it is {q}.');
});

test('the mocked draft has no false reference errors and a claims ledger', async () => {
  const { store, deps, jobId, articleId } = setup();
  await runToEnd(deps, jobId);
  const c = (await store.getArticle(articleId))!.content as SeshatArticle & { validation: { claims?: { status: string }[] } };
  assert.ok(!c.validation.issues.some((i) => i.code === 'dataset-missing' || i.code === 'source-missing'), JSON.stringify(c.validation.issues.filter((i) => /missing/.test(i.code))));
  assert.ok((c.validation.claims ?? []).length > 3);
});

// ── Quantity metadata and numerical-claim checks ─────────────────────────
import { checkText, verifyQuotedQuantity, type QuantityFact } from '../../lib/studio/quantity.ts';

const qf = (q: Partial<QuantityFact['quantity']> & object, extra: Partial<QuantityFact> = {}): QuantityFact => ({
  value: 1, format: 'pct', decimals: 1, seriesIds: [], method: '', ...extra,
  quantity: { kind: 'level', unit: '%', measure: 'rate', temporal: 'historical', ...q } as QuantityFact['quantity'],
});
const F: Record<string, QuantityFact> = {
  capexPerMw: qf({ kind: 'level', unit: 'US$', denominator: 'mw', measure: 'price' }, { format: 'text', text: '$15 million–$20 million per MW' }),
  ratesChg5y: qf({ kind: 'change', window: '5y', unit: 'pp' }, { format: 'pp' }),
  ratesChg1y: qf({ kind: 'change', window: '1y', unit: 'pp' }, { format: 'pp' }),
  ratesLatest: qf({ kind: 'level', unit: '%', period: '2026-11-25' }, { date: '2026-11-25' }),
  priceLatest: qf({ kind: 'level', unit: 'US$', measure: 'price', period: '2026-10-01' }, { format: 'level', date: '2026-10-01' }),
  demand2030: qf({ kind: 'level', unit: 'TWh', measure: 'flow', temporal: 'forecast', period: '2030' }, { format: 'text', text: '1,000 terawatt-hours' }),
  inventories: qf({ kind: 'level', unit: 'thousand barrels', measure: 'stock' }, { format: 'level' }),
};
const issuesOf = (text: string) => checkText('p', text, F, (s) => s).flatMap((c) => c.issues.map((i) => i.code));

test('claim check: a per-MW cost presented as a year-over-year increase is rejected', () => {
  const codes = issuesOf('Spending on substations has jumped by {capexPerMw} year-over-year.');
  assert.ok(codes.includes('level-as-change'));
  assert.ok(codes.includes('rate-framing'));
  assert.ok(issuesOf('Each megawatt of new capacity needs {capexPerMw} per megawatt of grid work.').length === 0);
  assert.ok(issuesOf('Grid work costs {capexPerMw} per kWh.').includes('unit-mismatch'));
});

test('claim check: change/level confusion, period mismatch, forecasts, comparisons, stocks and dates', () => {
  assert.ok(issuesOf('Mortgage rates reached {ratesChg5y} this year.').includes('change-as-level'));
  assert.ok(issuesOf('Rates are up {ratesChg5y} year-over-year.').includes('period-mismatch'));
  assert.ok(issuesOf('Demand reached {demand2030} last year.').includes('forecast-as-fact'));
  assert.ok(issuesOf('Rates moved from {ratesLatest} to {ratesChg1y}.').includes('dimension-mismatch'));
  assert.ok(issuesOf('Inventories hold {inventories} per day.').includes('stock-as-flow'));
  assert.ok(issuesOf('In 2024, mortgage rates were {ratesLatest}.').includes('date-mismatch'));
});

test('claim check: correct sentences are not flagged (false-positive guard)', () => {
  for (const ok of [
    'Mortgage rates have risen {ratesChg5y} over five years to {ratesLatest}.',
    'Rates rose {ratesChg1y} over the past year.',
    'The EIA expects demand to reach {demand2030} by 2030.',
    'The median price stands at {priceLatest}.',
    'In 2026, rates were {ratesLatest}.',
    'Rates moved from {ratesLatest} to {ratesLatest}.',
    'Commercial inventories were {inventories}.',
  ]) assert.deepEqual(issuesOf(ok), [], ok);
});

// Level-vs-change is decided by the words attached to each token, not by comparative or change
// language elsewhere in the sentence (false positives found in product-owner testing, 2026-11-28).
const G: Record<string, QuantityFact> = {
  aiShare: qf({ kind: 'level', unit: '%', measure: 'ratio', period: '2026-11-03' }, { format: 'text', text: 'about 26%', date: '2026-11-03' }),
  top10Weight: qf({ kind: 'level', unit: '%', measure: 'ratio' }),
  unemployment: qf({ kind: 'level', unit: '%', measure: 'rate' }),
  spxYoy: qf({ kind: 'change', window: '1y', unit: '%', measure: 'index' }),
  yieldChgPp: qf({ kind: 'change', window: '1y', unit: 'pp' }, { format: 'pp' }),
  gldLatest: qf({ kind: 'level', unit: 'US$ per share', denominator: 'share', measure: 'price', period: '2026-11-25' }, { format: 'level', date: '2026-11-25' }),
};
const gIssues = (text: string) => checkText('p', text, G, (s) => s).flatMap((c) => c.issues.map((i) => i.code));

test('claim check: percentage levels, shares and index weights are not read as changes', () => {
  for (const ok of [
    // The two sentences from the "index fund paradox" draft (story.blocks[4], analytics.implications.items[0].shows).
    'The current concentration is driven significantly by AI-related companies, with six of the largest companies making up {aiShare} of the index as of November 2026.',
    'The top 10 stocks comprise a significantly larger share of the index than in previous eras, with six AI-related companies making up {aiShare} of the index as of November 2026.',
    'Six companies make up {aiShare} of the S&P 500.',
    'Together they made up about {aiShare} of the index.',
    'The ten largest stocks take up {top10Weight} of the index, a larger share than in any earlier era.',
    'Their weights add up to {top10Weight}.',
    'The unemployment rate stands at {unemployment}, higher than a year ago.',
    'Concentration has risen sharply: the top ten now account for {top10Weight} of the index.',
  ]) assert.deepEqual(gIssues(ok), [], ok);
});

test('claim check: percentage and percentage-point changes keep working; mixed sentences judge each figure', () => {
  for (const ok of [
    'The S&P 500 is up {spxYoy} over the past year.',
    'The index rose {spxYoy} year-over-year.',
    'The 10-year yield climbed {yieldChgPp} over the past year.',
    'Yields are down {yieldChgPp} from a year earlier.',
    // Several figures, different meanings, in one sentence.
    'The index rose {spxYoy} over the past year, while six companies make up {aiShare} of it.',
    'The index gained {spxYoy} over the year as the ten largest stocks grew to {top10Weight} of its value.',
  ]) assert.deepEqual(gIssues(ok), [], ok);
});

test('claim check: genuine level-vs-change errors are still detected', () => {
  assert.ok(gIssues('AI stocks jumped {aiShare} this year.').includes('level-as-change'));
  assert.ok(gIssues('The index is up {aiShare} since January.').includes('level-as-change'));
  assert.ok(gIssues('Their weight rose by {top10Weight}.').includes('level-as-change'));
  assert.ok(gIssues('Unemployment fell {unemployment}.').includes('level-as-change'));
  assert.ok(gIssues('The index reached {spxYoy}.').includes('change-as-level'));
  assert.ok(gIssues('Yields stand at {yieldChgPp}.').includes('change-as-level'));
  // Mixed sentence: the correct figure passes, the misused one is flagged by name.
  const msgs = checkText('p', 'Six companies make up {aiShare} of the index, which surged {top10Weight}.', G, (s) => s).flatMap((c) => c.issues.map((i) => i.message));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /\{top10Weight\} is a level/);
});

test('claim check: "as of" after a per-share price is not a foreign denominator; real ones still are', () => {
  assert.deepEqual(gIssues('GLD fell to {gldLatest} as of 25 November, just above its 52-week low.'), []);
  assert.deepEqual(gIssues('GLD trades at {gldLatest} a share.'), []);
  assert.ok(gIssues('GLD costs {gldLatest} per ounce.').includes('unit-mismatch'));
  assert.ok(gIssues('GLD costs {gldLatest}/ounce.').includes('unit-mismatch'));
  assert.ok(issuesOf('Grid work costs {capexPerMw} a kWh.').includes('unit-mismatch'));
});

test('quoted figures: forecast language, missing denominators and fake changes are corrected from the quote', () => {
  const a = verifyQuotedQuantity('1,000 terawatt-hours', 'Consumption will reach 1,000 terawatt-hours by 2030.', { kind: 'level', measure: 'flow', unit: 'TWh', denominator: '', temporal: 'historical', period: '2030' });
  assert.equal(a.quantity.temporal, 'forecast');
  const b = verifyQuotedQuantity('$15 million–$20 million per MW', 'Grid upgrades cost $15 million–$20 million per MW of new load.', { kind: 'change', measure: 'price', unit: 'US$', denominator: 'megawatt', temporal: 'historical', period: '' });
  assert.equal(b.quantity.denominator, 'mw');
  assert.equal(b.quantity.kind, 'level'); // no change language in the quote
  const c = verifyQuotedQuantity('220 gigawatts', 'The queue holds 220 gigawatts.', { kind: 'level', measure: 'stock', unit: 'GW', denominator: 'year', temporal: 'historical', period: '' });
  assert.equal(c.quantity.denominator, undefined); // "per year" is not in the quote
});

import { resolveBareSeriesRefs } from '../../lib/studio/pipeline/stages.ts';
test('bare series references resolve to the latest value; other unknown references stay (and are flagged)', () => {
  const a = { story: { dek: 'SF is {caseShillerSF} ({caseShillerSF.date}); {nope} stays.' }, macro: {}, analytics: {}, outlook: {}, data: { facts: { caseShillerSFLatest: { value: 1, format: 'num', decimals: 0, seriesIds: [], method: '', date: '2026-09-01' } }, dates: {} } };
  assert.deepEqual(resolveBareSeriesRefs(a as never), ['caseShillerSF', 'caseShillerSF']);
  assert.equal(a.story.dek, 'SF is {caseShillerSFLatest} ({caseShillerSFLatest.date}); {nope} stays.');
});

// ── Coverage: counterexamples ────────────────────────────────────────────
import { registryMatches } from '../../lib/studio/registry.ts';
import { recentChange } from '../../lib/studio/pipeline/stages.ts';

test('coverage: dispersion across comparable series names the ones that fell', () => {
  const mk = (key: string, a: number, b: number) => ds(key, 'Index Jan 2000=100', 'Monthly', [{ date: '2025-09-01', value: a }, { date: '2026-09-01', value: b }]);
  const p = buildDataProducts([mk('dallas', 300, 297), mk('nyc', 300, 317), mk('seattle', 380, 373), mk('chicago', 200, 214)], [], []);
  const line = p.observations.find((o) => o.startsWith('Across 4 comparable series'))!;
  assert.match(line, /2 of 4 fell: (dallas, seattle|seattle, dallas)/);
});

test('coverage: candidate screening reports the latest one-year change; regional needs reach all metros', () => {
  assert.equal(recentChange([{ date: '2025-09-01', value: 200 }, { date: '2026-09-01', value: 196 }], 'Index'), 'latest 196 (2026-09-01) · 1y -2.0%');
  assert.equal(recentChange([{ date: '2025-11-01', value: 6.5 }, { date: '2026-11-01', value: 7.25 }], 'Percent'), 'latest 7.25 (2026-11-01) · 1y +0.75 pp');
  const m = registryMatches('regional metro home price differences', 4).filter((e) => e.tags.includes('regional'));
  assert.equal(m.length, 20);
});

// ── Provider outage handling ─────────────────────────────────────────────
import { ProviderError } from '../../lib/studio/providers/http.ts';
test('provider outage: bounded calls, job completes, missing evidence is named (never substituted)', async () => {
  const { store, deps, articleId, jobId } = setup();
  let eiaCalls = 0;
  const downEia: DataProvider = {
    id: 'eia', name: 'US Energy Information Administration (EIA)', short: 'EIA', enabled: true,
    async meta() { eiaCalls++; throw new ProviderError('EIA meta: HTTP 504 from https://api.eia.gov/v2/', true, 504); },
    async fetch() { eiaCalls++; throw new ProviderError('EIA data: HTTP 504', true, 504); },
  };
  const fredFake = deps.data[0];
  const fred: DataProvider = { ...fredFake, search: async (q) => (/inventor|electric/i.test(q) ? [] : fredFake.search!(q, 12)), meta: fredFake.meta, fetch: fredFake.fetch };
  deps.data = [fred, downEia];
  const orig = scripted.plan;
  scripted.plan = () => ({ ...(orig() as object), dataNeeds: [{ need: 'exchange rate', why: 'core', searchText: 'yen dollar' }, { need: 'US crude oil inventories', why: 'supply', searchText: 'crude oil inventories stocks' }, { need: 'US electricity sales', why: 'demand', searchText: 'electricity consumption sales' }] });
  try {
    const job = await runToEnd(deps, jobId);
    assert.equal(job.status, 'succeeded');
    assert.ok(eiaCalls <= 3, `EIA called ${eiaCalls} times`); // breaker opens after 2 failures
    const c = (await store.getArticle(articleId))!.content as SeshatArticle;
    const gaps = c.evidence.gaps ?? [];
    assert.ok(gaps.some((g) => g.reason === 'provider-unavailable' && /EIA/.test(g.provider ?? '')), JSON.stringify(gaps));
    assert.ok(c.macro.attention.required && c.macro.attention.reasons.some((r) => /Missing evidence/.test(r)));
    assert.ok(c.methodology.some((m) => /provider was unreachable/.test(m)));
    assert.ok(!Object.keys(c.data.facts).some((k) => /inventor|electric/i.test(k))); // nothing invented
  } finally {
    scripted.plan = orig;
  }
});

import { classifySuperlatives } from '../../lib/studio/numbers.ts';
test('superlatives "since the start of the data" are verified against the data, true or false', () => {
  const facts = { aLatest: { value: 5, date: '2026-10-01' }, aHighAll: { value: 5, date: '2026-10-01' }, bLatest: { value: 4, date: '2026-10-01' }, bHighAll: { value: 6, date: '2022-01-01' } };
  assert.deepEqual(classifySuperlatives('Supply is {aLatest}, the highest level since {aHistoryStart}.', facts), []);
  assert.deepEqual(classifySuperlatives('Prices are {bLatest}, the highest level since {bHistoryStart}.', facts), [{ word: 'highest', verdict: 'contradicted' }]);
  assert.deepEqual(classifySuperlatives('The largest economy has the biggest risk.', facts), []); // descriptive use: not flagged
});

// ── Phase 3B.2: editorial intent and whole-article awareness reach the writing stages ──
test('author argument, voice and style guide reach the writing stages; later stages see earlier sections', async () => {
  const { deps, jobId, prompts } = setup({ brief: { argument: 'AUTHOR-ARGUMENT-MARKER: the weakness is mostly about rates.', voice: 'VOICE-MARKER: dry, sceptical.' } });
  await runToEnd(deps, jobId);
  for (const stage of ['synthesize', 'story', 'macro_analytics', 'outlook']) {
    assert.match(prompts[stage], /AUTHOR-ARGUMENT-MARKER/, `${stage} lost the author's argument`);
    assert.match(prompts[stage], /EDITORIAL INTENT/);
  }
  for (const stage of ['story', 'macro_analytics', 'outlook']) {
    assert.match(prompts[stage], /VOICE-MARKER/);
    assert.match(prompts[stage], /SESHAT EDITORIAL STYLE GUIDE/, `${stage} lacks the style guide`);
  }
  const story = scripted.story() as { blocks: { type: string; text?: string }[] };
  const firstParagraph = story.blocks.find((b) => b.type === 'p')!.text!;
  assert.ok(prompts.macro_analytics.includes(firstParagraph), 'macro/analytics must see the full Story text');
  assert.ok(prompts.outlook.includes('THE ARTICLE SO FAR') && prompts.outlook.includes('Mechanism:'), 'outlook must see the earlier sections');
  assert.match(prompts.repair ?? 'no repair', /keep the author's voice|no repair/);
});

test('formulaic "not X; it is Y" contrasts are detected (style note for repair), ordinary negation is not', async () => {
  const { findFormulaicContrasts } = await import('../../lib/studio/numbers.ts');
  for (const s of ['The gap is not a statistical error; it is a structural lag.', 'This disconnect is not merely statistical; it is psychological.', "The primary concern isn't that the technology doesn't work, but how it is being paid for.", 'the question is no longer whether AI is a trend, but whether'])
    assert.ok(findFormulaicContrasts(s).length, s);
  for (const s of ['Prices are not falling. Wages are rising slowly.', 'It was not the Fed that moved first; markets did.', 'Rates are not high by historical standards, but they are rising.'])
    assert.equal(findFormulaicContrasts(s).length, 0, s);
});

test('spelled-out multiples ("quadrupled", "more than double") count as figures that need a fact token', async () => {
  const { findBareNumbers } = await import('../../lib/studio/numbers.ts');
  for (const s of ['Mortgage rates have quadrupled since 2021.', 'The payment is now more than double what it was.', 'Payments are twice as high.'])
    assert.ok(findBareNumbers(s).length, s);
  for (const s of ['The Fed may double down on its stance.', 'Rates rose {mortgageChg5y} over five years.'])
    assert.equal(findBareNumbers(s).length, 0, s);
});

test('wording copied verbatim from an earlier section is reported for repair; short shared phrases are not', async () => {
  const { findReusedWording } = await import('../../lib/studio/numbers.ts');
  const story = ['Housing and medical care have kept rising, meaning the categories that matter most to household stability have not cooled at the same pace.'];
  assert.equal(findReusedWording(story, 'Sticky costs: the categories that matter most to household stability have not cooled at the same pace as the index.').length, 1);
  assert.equal(findReusedWording(story, 'Housing and medical care are the sticky part of the index.').length, 0);
});
