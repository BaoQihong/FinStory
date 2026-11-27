// Stage implementations. Boundaries:
//   LLM:  plan, select (choose among provider-verified candidates), synthesize,
//         story, macro_analytics, outlook, repair (rewrite flagged strings).
//   App:  search, discover, fetch (+ every calculation), assemble (validation,
//         citations, persistence).
import { z } from 'zod';
import type { DateFact, Fact } from '../../data/display.ts';
import { resolveTokensSafe } from '../../content/tokens.ts';
import { stringLeaves } from '../numbers.ts';
import { verifyQuotedQuantity } from '../quantity.ts';
import { createBreaker, type Gap, type ProviderOutage } from './breaker.ts';
import { ProviderError } from '../providers/http.ts';
import { shiftMonths } from '../../data/transforms.ts';
import { buildDataProducts, type ChartSpecInput, type DataProducts, type Dataset, type DerivedSpec } from '../facts.ts';
import { registryMatches } from '../registry.ts';
import type { DataProvider, SeriesMeta } from '../providers/types.ts';
import {
  AnalyticsSection,
  EvidenceKind,
  MacroSection,
  OutlookSection,
  SCHEMA_VERSION,
  SECTION_ORDER,
  SeshatArticleV1,
  StorySection,
  noAttention,
  type SeshatArticle,
  type StoryBrief,
} from '../schema.ts';
import { classifySource, figureInQuote, isStale, isoDate, leadingNumber, publisherOf, quoteAppears, rankSources } from '../sources.ts';
import { frequencyClass } from '../units.ts';
import { applyAttention, validateArticle } from '../validate.ts';
import { ATTENTION_RULE, STORYBOARD, SYSTEM, VOICE, briefBlock, dateLines, factLines, untrusted } from './prompts.ts';
import type { DatasetRow, FindingRow, SourceRow, Stage, StageContext } from './types.ts';

// ── Limits (cost and runtime guards) ────────────────────────────────────────
export const LIMITS = {
  searches: 6,
  resultsPerSearch: 6,
  keptSources: 14,
  extractUrls: 6,
  candidatesPerNeed: 6,
  maxCandidates: 42,
  maxSeries: 10,
  historyYears: 12,
  excerptChars: 5000,
};

const t = (n: number) => z.string().trim().min(1).max(n);
const KEY = z.string().regex(/^[a-z][a-zA-Z0-9]{1,23}$/, 'camelCase, letters/digits, 2–24 chars');

// ── A. Plan ─────────────────────────────────────────────────────────────────
export const PlanOut = z.object({
  workingTitle: t(160),
  section: z.enum(['markets', 'economy', 'technology', 'wealth']),
  centralQuestion: t(300),
  angle: t(500),
  whyReadersCare: t(500),
  questions: z.array(t(300)).min(2).max(6),
  searches: z.array(z.object({ query: t(200), purpose: t(200), recent: z.boolean() })).min(3).max(LIMITS.searches),
  dataNeeds: z.array(z.object({ need: t(200), why: t(300), searchText: t(120) })).min(2).max(9),
  /** Evidence that could CONTRADICT the premise — researched deliberately, not only supporting data. */
  counterChecks: z.array(z.object({ premise: t(200), contradictingEvidence: t(300), searchText: t(120) })).min(1).max(4),
  storyboardConcern: z.string().max(400),
});
export type PlanOut = z.infer<typeof PlanOut>;

async function plan(ctx: StageContext): Promise<PlanOut> {
  const { deps, article } = ctx;
  const user = `${briefBlock(article.brief)}

Today is ${deps.today()}.
${STORYBOARD}

Plan the research for this story:
- workingTitle: a provisional title. section: the best fit of markets / economy / technology / wealth.
- centralQuestion, angle and whyReadersCare: the editorial core in plain language.
- questions: what the research must answer.
- searches: ${LIMITS.searches} or fewer web searches. Mix recent developments (recent=true, e.g. latest central-bank decisions, announcements) and background/mechanism explainers (recent=false). Favour queries that surface primary sources (central banks, statistical agencies, official agencies) and credible financial journalism.
- dataNeeds: the economic/market time series that would let readers see the story in numbers. Include a need for EVERY measurable thing the brief explicitly asks about (e.g. "regional price differences" → regional/metro price indices; "consumer electricity prices" → a retail electricity price series) (e.g. an exchange rate, policy rates, bond yields, commodity prices, inventories, an equity benchmark). For each give searchText: a short phrase to search an economic-data catalogue (like FRED), e.g. "Japan 10-year government bond yield".
- counterChecks: 1–4 ways the premise could be WRONG and the data that would show it (e.g. "prices are resilient" → "metros where prices fell" with searchText "home price index metro"; "data centers raise bills" → "states with fast data-center growth but flat prices"). For geographically diverse subjects always include a regional check.
- storyboardConcern: empty string if the prompt suits a four-section financial story (story, macro numbers, analytics, outlook); otherwise explain the problem.`;
  const r = await deps.llm.complete({ stage: 'plan', system: SYSTEM, user, schema: PlanOut, maxTokens: 1800, temperature: 0.3 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  if (r.data.storyboardConcern.trim()) ctx.warn(`Storyboard concern from planning: ${r.data.storyboardConcern}`);
  return r.data;
}

// ── B. Search ───────────────────────────────────────────────────────────────
export type SearchOut = { sources: Omit<SourceRow, 'excerpt' | 'snippet'>[]; failedQueries: string[] };

async function search(ctx: StageContext): Promise<SearchOut> {
  const { deps } = ctx;
  const p = ctx.outputs.plan as PlanOut;
  const today = deps.today();
  const seen = new Map<string, SourceRow>();
  const failed: string[] = [];
  let credits = 0;
  let calls = 0;
  for (const s of p.searches.slice(0, LIMITS.searches)) {
    try {
      calls++;
      const r = await deps.search.search(s.query, { recent: s.recent, maxResults: LIMITS.resultsPerSearch });
      credits += r.credits;
      for (const x of r.results) {
        const url = x.url.split('#')[0];
        if (!/^https?:\/\//.test(url) || seen.has(url) || !x.content.trim()) continue;
        const published = isoDate(x.publishedDate);
        seen.set(url, {
          ref: '',
          url,
          title: x.title.slice(0, 300),
          publisher: publisherOf(url),
          source_type: classifySource(url),
          published_at: published,
          stale: isStale(published, today),
          query: s.query,
          snippet: x.content.slice(0, 1500),
          excerpt: x.content.slice(0, LIMITS.excerptChars),
          score: x.score,
          provider: deps.search.name,
        });
      }
    } catch (e) {
      failed.push(s.query);
      ctx.warn(`Search failed for "${s.query}": ${(e as Error).message}`);
    }
  }
  if (!seen.size) throw Object.assign(new Error(`All ${p.searches.length} web searches failed or returned nothing`), { retryable: true });
  // Rank (primary → journalism → other), cap, and number.
  const ranked = rankSources(
    [...seen.values()].map((s) => ({ ...s, sourceType: s.source_type })),
  ).slice(0, LIMITS.keptSources);
  ranked.forEach((s, i) => (s.ref = `S${i + 1}`));
  // Fuller text for the top non-"other" sources (provider-side extraction).
  const toExtract = ranked.filter((s) => s.source_type !== 'other').slice(0, LIMITS.extractUrls);
  if (toExtract.length) {
    try {
      calls++;
      const ex = await deps.search.extract(toExtract.map((s) => s.url), (ctx.outputs.plan as PlanOut).centralQuestion);
      credits += ex.credits;
      for (const r of ex.results) {
        const s = ranked.find((x) => x.url === r.url);
        if (s && r.content.length > s.excerpt.length) s.excerpt = r.content.slice(0, LIMITS.excerptChars);
      }
    } catch (e) {
      ctx.warn(`Source text extraction failed (continuing with search snippets): ${(e as Error).message}`);
    }
  }
  const rows: SourceRow[] = ranked.map((s) => {
    const row: SourceRow & { sourceType?: string } = { ...s };
    delete row.sourceType;
    return row;
  });
  await deps.store.replaceSources(ctx.job.id, ctx.article.id, rows);
  const stale = rows.filter((r) => r.stale).length;
  const undated = rows.filter((r) => !r.published_at).length;
  if (stale) ctx.warn(`${stale} source(s) are more than 18 months old and are marked stale.`);
  if (undated) ctx.warn(`${undated} source(s) have no detectable publication date.`);
  if (!rows.some((r) => r.source_type === 'primary')) ctx.warn('No primary (official) sources were found; evidence relies on secondary reporting.');
  ctx.metric({ calls: { [deps.search.name]: calls }, credits });
  const summary = rows.map((r) => {
    const s: Partial<SourceRow> = { ...r };
    delete s.excerpt;
    delete s.snippet;
    return s as Omit<SourceRow, 'excerpt' | 'snippet'>;
  });
  return { sources: summary, failedQueries: failed };
}

// ── C. Discover (application code: provider catalogues + registry) ─────────
export type Candidate = SeriesMeta & { cid: string; forNeeds: number[]; recent?: string };

/** "latest 158.8 · 1y +0.9%" (or "+0.25 pp" for rates) from a short observation window. */
export function recentChange(obs: { date: string; value: number | null }[], units: string): string {
  const pts = obs.filter((o): o is { date: string; value: number } => o.value !== null);
  if (pts.length < 2) return 'n/a';
  const last = pts[pts.length - 1];
  const target = shiftMonths(last.date, -12);
  const prior = [...pts].reverse().find((p) => p.date <= target);
  if (!prior) return `latest ${last.value} (${last.date})`;
  const rate = /percent|^pct|%/i.test(units);
  const ch = rate ? `${(last.value - prior.value >= 0 ? '+' : '')}${(last.value - prior.value).toFixed(2)} pp` : prior.value === 0 ? 'n/a' : `${last.value >= prior.value ? '+' : ''}${(100 * (last.value / prior.value - 1)).toFixed(1)}%`;
  return `latest ${last.value} (${last.date}) · 1y ${ch}`;
}
export type DiscoverOut = { candidates: Candidate[]; needsWithoutCandidates: string[]; disabledProviders: string[]; gaps?: Gap[]; outages?: ProviderOutage[] };

function freshEnough(m: SeriesMeta, today: string): boolean {
  if (!m.observationEnd) return true;
  const c = frequencyClass(m.frequency);
  const months = c === 'annual' ? 30 : c === 'quarterly' ? 12 : c === 'monthly' ? 8 : 3;
  return m.observationEnd >= shiftMonths(today, -months);
}

async function discover(ctx: StageContext): Promise<DiscoverOut> {
  const { deps } = ctx;
  const p = ctx.outputs.plan as PlanOut;
  const today = deps.today();
  const providers = Object.fromEntries(deps.data.map((d) => [d.id, d])) as Record<string, DataProvider>;
  const byKey = new Map<string, Candidate>();
  const calls: Record<string, number> = {};
  const count = (id: string) => (calls[id] = (calls[id] ?? 0) + 1);
  const add = (m: SeriesMeta, need: number) => {
    const k = `${m.provider}:${m.id}`;
    const ex = byKey.get(k);
    if (ex) {
      if (!ex.forNeeds.includes(need)) ex.forNeeds.push(need);
    } else if (byKey.size < LIMITS.maxCandidates) byKey.set(k, { ...m, cid: '', forNeeds: [need] });
  };
  const without: string[] = [];
  const breaker = createBreaker();
  const triedFor: Set<string>[] = [];
  // Network lookups run concurrently (EIA can take 20–45 s per call); results are
  // merged afterwards in need order so candidate numbering stays deterministic.
  const fred = providers.fred;
  // Counter-checks are researched as data needs in their own right.
  const needs = [...p.dataNeeds, ...(p.counterChecks ?? []).map((c) => ({ need: `Counter-check: ${c.contradictingEvidence}`, why: `Tests the premise "${c.premise}"`, searchText: c.searchText }))];
  (p as { dataNeeds: typeof needs }).dataNeeds = needs;
  const lookups = await Promise.all(
    needs.map(async (need) => {
      const out: SeriesMeta[] = [];
      const tried = new Set<string>();
      if (fred?.enabled && fred.search) {
        tried.add('fred');
        count('fred');
        const found = await breaker.run('fred', () => fred.search!(need.searchText, 12));
        if (found) out.push(...found.filter((m) => !/discontinued/i.test(m.title) && freshEnough(m, today)).slice(0, LIMITS.candidatesPerNeed));
      }
      const reg = registryMatches(`${need.need} ${need.searchText}`, 3).filter((r) => providers[r.provider]?.enabled);
      const metas = await Promise.all(
        reg.map((r) => {
          tried.add(r.provider);
          if (breaker.isOpen(r.provider)) return undefined;
          count(r.provider);
          return breaker.run(r.provider, () => providers[r.provider].meta(r.id));
        }),
      );
      for (const m of metas) if (m && freshEnough(m, today)) out.push(m);
      return { out, tried };
    }),
  );
  lookups.forEach(({ out: metas, tried }, i) => {
    triedFor[i] = tried;
    for (const m of metas) add(byKey.get(`${m.provider}:${m.id}`) ?? m, i);
    if (![...byKey.values()].some((c) => c.forNeeds.includes(i))) without.push(p.dataNeeds[i].need);
  });
  // Tickers the editor named explicitly (e.g. "EWJ, SPY") are verified with the market-data provider.
  const tiingo = providers.tiingo;
  if (tiingo?.enabled && ctx.article.brief.assets) {
    for (const tk of (ctx.article.brief.assets.match(/\b[A-Z]{2,5}\b/g) ?? []).slice(0, 4)) {
      if (byKey.has(`tiingo:${tk}`)) continue;
      count('tiingo');
      const m = await breaker.run('tiingo', () => tiingo.meta(tk));
      if (m) add(m, -1);
    }
  }
  const candidates = [...byKey.values()];
  candidates.forEach((c, i) => (c.cid = `C${i + 1}`));
  // Screen candidates against their own recent data so selection can see counterexamples
  // (e.g. which metros fell) instead of guessing from titles. FRED only; bounded concurrency.
  const toScreen = candidates.filter((c) => c.provider === 'fred').slice(0, 40);
  const since = `${Number(today.slice(0, 4)) - 2}-01-01`;
  for (let i = 0; i < toScreen.length; i += 8) {
    await Promise.all(
      toScreen.slice(i, i + 8).map(async (c) => {
        count('fred');
        const r = await breaker.run('fred', () => fred!.fetch(c.id, since));
        c.recent = r ? recentChange(r.observations, c.units) : 'n/a';
      }),
    );
  }
  // Explicit evidence gaps: an outage is named as such (recoverable later), never papered over.
  const outages = breaker.outages();
  const nameOf = (id: string) => providers[id]?.name ?? id;
  const gaps: Gap[] = without.map((need) => {
    const i = p.dataNeeds.findIndex((n) => n.need === need);
    const failed = [...(triedFor[i] ?? [])].filter((id) => breaker.failedFor(id));
    return failed.length
      ? { need, reason: 'provider-unavailable' as const, provider: failed.map(nameOf).join(', '), detail: outages.find((o) => o.provider === failed[0])?.lastError }
      : { need, reason: 'no-dataset' as const };
  });
  for (const g of gaps) ctx.warn(g.reason === 'provider-unavailable' ? `Missing evidence — ${g.need}: ${g.provider} unavailable (${g.detail ?? 'service error'}); re-run later to fill.` : `No current dataset found for: ${g.need}`);
  for (const o of outages) ctx.warn(`${nameOf(o.provider)} failed ${o.failures}× during discovery (${o.lastError}); ${breaker.isOpen(o.provider) ? 'treated as unavailable for this job' : 'continuing'}.`);
  const disabled = deps.data.filter((d) => !d.enabled).map((d) => d.name);
  if (disabled.length) ctx.warn(`Data providers not configured: ${disabled.join(', ')}`);
  ctx.metric({ calls });
  return { candidates, needsWithoutCandidates: without, disabledProviders: disabled, gaps, outages };
}

// ── D. Select (LLM chooses among verified candidates) ──────────────────────
export const SelectOut = z.object({
  series: z.array(z.object({ candidate: z.string().regex(/^C\d+$/), key: KEY, label: t(80), reason: t(240) })).min(1).max(LIMITS.maxSeries),
  derived: z
    .array(z.object({ key: KEY, op: z.enum(['yoy', 'difference', 'convert']), inputs: z.array(KEY).min(1).max(2), label: t(80), reason: t(240) }))
    .max(4),
  charts: z
    .array(z.object({ id: KEY, seriesKeys: z.array(KEY).min(1).max(4), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), purpose: t(240) }))
    .min(1)
    .max(5),
  unmetNeeds: z.array(z.object({ need: t(200), why: t(300) })).max(7),
});
export type SelectOut = z.infer<typeof SelectOut>;

async function select(ctx: StageContext): Promise<SelectOut> {
  const p = ctx.outputs.plan as PlanOut;
  const d = ctx.outputs.discover as DiscoverOut;
  if (!d.candidates.length) throw Object.assign(new Error('No candidate datasets were discovered for any data need'), { retryable: false });
  const list = d.candidates
    .map((c) => `${c.cid} | ${c.provider.toUpperCase()} ${c.id} | ${c.title} | units: ${c.units} | ${c.frequency}${c.seasonalAdjustment ? `, ${c.seasonalAdjustment}` : ''} | ${c.observationStart || '?'} → ${c.observationEnd} | needs: ${c.forNeeds.map((n) => (n < 0 ? 'editor-named' : n + 1)).join(',')}${c.recent ? ` | recent: ${c.recent}` : ''}`)
    .join('\n');
  const user = `${briefBlock(ctx.article.brief)}

Central question: ${p.centralQuestion}
Data needs (including counter-checks of the premise):
${p.dataNeeds.map((n, i) => `${i + 1}. ${n.need} — ${n.why}`).join('\n')}

CANDIDATE DATASETS (metadata reported by the data providers; choose ONLY from these):
${list}

Choose the datasets for this story:
- series: up to ${LIMITS.maxSeries} candidates that best answer the data needs. Do NOT pick only series that support the premise: "recent" shows each candidate's latest one-year change — for counter-checks and regional comparisons include contrasting cases (e.g. regions that fell as well as ones that rose). Cover every data need that has a suitable candidate before adding a second series for any one need — explicit requests in the brief (e.g. regional comparisons: pick 2–4 contrasting regions) come first. CHECK THE UNITS AND TITLE match the need: an exchange rate has units like 'Japanese Yen to One U.S. Dollar'; a policy or market rate is in Percent; intervention amounts, flows, issuance or counts are NOT prices or rates — never use them as one. Prefer current, frequently updated, headline measures; avoid near-duplicates. Give each a short camelCase key (e.g. usdjpy, japan10y, wti) and a reader-friendly label (e.g. "Yen per US dollar").
- derived: optional calculations the application will perform: "difference" (inputs [a, b] → a minus b; both must have the SAME units, e.g. two interest rates → a yield differential); "yoy" (inputs [x] → year-over-year % change of an index or price; never of a rate); "convert" (inputs [asset, fxRate] → an asset priced in a foreign currency re-expressed in the exchange rate's base currency, e.g. a Japanese stock index in US-dollar terms using yen-per-dollar — use it whenever the story concerns foreign assets held by investors in another currency). Use series keys as inputs.
- charts: 1–5 charts, each answering one editorial question. seriesKeys (series or derived keys) in one chart MUST share the same units; at most 4. from = start date (YYYY-MM-DD), usually 3–10 years before today (${ctx.deps.today()}).
- unmetNeeds: data needs none of the candidates can meet (do not force an unrelated series).`;
  const r = await ctx.deps.llm.complete({ stage: 'select', system: SYSTEM, user, schema: SelectOut, maxTokens: 2000, temperature: 0.2 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  const known = new Set(d.candidates.map((c) => c.cid));
  const out = { ...r.data, series: r.data.series.filter((s) => known.has(s.candidate)) };
  const dropped = r.data.series.length - out.series.length;
  if (dropped) ctx.warn(`${dropped} selected dataset(s) referenced unknown candidates and were ignored.`);
  const keys = new Set<string>();
  out.series = out.series.filter((s) => (keys.has(s.key) ? false : (keys.add(s.key), true)));
  for (const u of out.unmetNeeds) ctx.warn(`Data limitation: ${u.need} — ${u.why}`);
  if (!out.series.length) throw Object.assign(new Error('Model selected no valid datasets'), { retryable: true });
  return out;
}

// ── E. Fetch observations + deterministic products ─────────────────────────
export type FetchOut = { products: DataProducts; datasetKeys: string[]; asOf: string; gaps?: Gap[] };

export function datasetFromRow(r: DatasetRow, providers: DataProvider[]): Dataset {
  const p = providers.find((x) => x.id === r.provider);
  return {
    key: r.key,
    provider: p?.name ?? r.provider,
    providerShort: p?.short ?? r.provider.toUpperCase(),
    seriesId: r.series_id,
    name: r.name,
    units: r.units,
    frequency: r.frequency,
    seasonalAdjustment: r.seasonal_adjustment,
    definition: r.definition,
    sourceUrl: r.source_url,
    retrievedAt: r.retrieved_at,
    transformations: r.transformations,
    observations: r.observations,
    sha256: r.sha256,
  };
}

export function productsFromSelection(rows: DatasetRow[], sel: SelectOut, providers: DataProvider[]): DataProducts {
  const datasets = rows.map((r) => datasetFromRow(r, providers));
  const labels = Object.fromEntries(sel.series.map((s) => [s.key, s.label]));
  for (const d of datasets) if (labels[d.key]) d.name = labels[d.key];
  const derived: DerivedSpec[] = sel.derived.map((x): DerivedSpec =>
    x.op === 'yoy'
      ? { key: x.key, op: 'yoy', of: x.inputs[0], label: x.label }
      : x.op === 'convert'
        ? { key: x.key, op: 'convert', a: x.inputs[0], fx: x.inputs[1] ?? '', label: x.label }
        : { key: x.key, op: 'difference', a: x.inputs[0], b: x.inputs[1] ?? '', label: x.label },
  );
  const charts: ChartSpecInput[] = sel.charts.map((c) => ({ id: c.id, seriesKeys: c.seriesKeys, from: c.from }));
  return buildDataProducts(datasets, derived, charts);
}

async function fetchData(ctx: StageContext): Promise<FetchOut> {
  const { deps } = ctx;
  const d = ctx.outputs.discover as DiscoverOut;
  const sel = ctx.outputs.select as SelectOut;
  const start = `${Number(deps.today().slice(0, 4)) - LIMITS.historyYears}-01-01`;
  const rows: DatasetRow[] = [];
  const fetchGaps: Gap[] = [];
  const calls: Record<string, number> = {};
  // Fetch all selected series concurrently (bounded by the selection size, ≤ 8).
  const fetched = await Promise.all(
    sel.series.map(async (s) => {
      const c = d.candidates.find((x) => x.cid === s.candidate)!;
      const prov = deps.data.find((p) => p.id === c.provider);
      if (!prov?.enabled) return { s, c, error: `${c.provider} is not configured` };
      try {
        return { s, c, prov, r: await prov.fetch(c.id, start) };
      } catch (e) {
        return { s, c, error: (e as Error).message, outage: e instanceof ProviderError ? e.retryable : true, provider: prov.name };
      }
    }),
  );
  for (const f of fetched) {
    const { s, c } = f;
    if (!('r' in f) || !f.r || !f.prov) {
      const outage = 'outage' in f && f.outage;
      ctx.warn(`Could not retrieve ${c.id} (${s.label}): ${'error' in f ? f.error : 'unknown error'}${outage ? ' — recorded as missing evidence; re-run later to fill' : ''}`);
      fetchGaps.push({ need: s.label, reason: outage ? 'provider-unavailable' : 'no-dataset', provider: 'provider' in f ? f.provider : undefined, detail: 'error' in f ? String(f.error).slice(0, 200) : undefined });
      continue;
    }
    const { r, prov } = f;
    calls[prov.id] = (calls[prov.id] ?? 0) + r.calls;
    const present = r.observations.filter((o) => o.value !== null);
    if (present.length < 2) {
      ctx.warn(`${c.id} returned too few observations; skipped.`);
      continue;
    }
    if (!freshEnough({ ...r.meta, observationEnd: present.at(-1)!.date }, deps.today()))
      ctx.warn(`${s.label} (${c.id}) is stale: latest observation ${present.at(-1)!.date}.`);
    const missing = r.observations.length - present.length;
    rows.push({
      key: s.key,
      provider: prov.id,
      series_id: r.meta.id,
      name: s.label,
      units: r.meta.units,
      frequency: r.meta.frequency,
      seasonal_adjustment: r.meta.seasonalAdjustment,
      definition: `${r.meta.title}.${r.meta.notes ? ' ' + r.meta.notes : ''}`.slice(0, 900),
      source_url: r.meta.sourceUrl,
      retrieved_at: r.retrievedAt,
      observation_start: r.observations[0]?.date ?? null,
      observation_end: present.at(-1)!.date,
      transformations: [...r.transformations, ...(missing ? [`${missing} missing observation(s) kept as gaps (not filled).`] : [])],
      observations: r.observations,
      sha256: r.sha256,
    });
  }
  if (!rows.length) throw Object.assign(new Error('No financial data could be retrieved'), { retryable: true });
  await deps.store.replaceDatasets(ctx.job.id, ctx.article.id, rows);
  const products = productsFromSelection(rows, sel, deps.data);
  for (const i of products.issues) ctx.warn(i);
  ctx.metric({ calls });
  const asOf = rows.map((r) => r.observation_end!).sort().at(-1)!;
  return { products, datasetKeys: rows.map((r) => r.key), asOf, gaps: fetchGaps };
}

// ── F. Synthesize evidence (LLM) + deterministic quote verification ────────
const SupportLevel = z.enum(['supported', 'thin', 'unsupported']);
export const SynthOut = z.object({
  thesis: t(700),
  findings: z
    .array(z.object({ claim: t(400), kind: EvidenceKind, sourceRefs: z.array(z.string().regex(/^S\d+$/)).max(4), quote: z.string().max(400) }))
    .min(2)
    .max(16),
  sourceFigures: z
    .array(
      z.object({
        key: KEY,
        figure: t(80),
        quote: t(400),
        sourceRef: z.string().regex(/^S\d+$/),
        about: t(200),
        // What the number IS — checked against the quote by verifyQuotedQuantity().
        kind: z.enum(['level', 'change', 'rate']),
        measure: z.enum(['stock', 'flow', 'price', 'rate', 'index', 'ratio', 'count', 'other']),
        unit: z.string().max(40),
        denominator: z.string().max(40),
        temporal: z.enum(['historical', 'forecast', 'estimate', 'target']),
        period: z.string().max(40),
      }),
    )
    .max(10),
  conflicts: z.array(z.object({ description: t(400), sourceRefs: z.array(z.string()).max(4) })).max(5),
  gaps: z.array(t(300)).max(6),
  sectionSupport: z.object({ story: SupportLevel, macro: SupportLevel, analytics: SupportLevel, outlook: SupportLevel }),
});
export type SynthOut = z.infer<typeof SynthOut>;
export type SynthResult = SynthOut & { verifiedFindings: FindingRow[]; sourceFacts: Record<string, Fact> };

async function synthesize(ctx: StageContext): Promise<SynthResult> {
  const { deps } = ctx;
  const p = ctx.outputs.plan as PlanOut;
  const f = ctx.outputs.fetch as FetchOut;
  const sources = await deps.store.getSources(ctx.job.id);
  let budget = 48_000;
  const blocks: string[] = [];
  for (const s of sources) {
    const body = s.excerpt.slice(0, Math.min(2600, budget));
    if (body.length < 80) continue;
    budget -= body.length;
    blocks.push(untrusted(s.ref, `type="${s.source_type}" publisher="${s.publisher}" published="${s.published_at ?? 'unknown'}"${s.stale ? ' stale="true"' : ''} title="${s.title.replace(/"/g, "'")}"`, body));
  }
  const user = `${briefBlock(ctx.article.brief)}

Central question: ${p.centralQuestion}
Angle: ${p.angle}
Today: ${deps.today()}. Latest data: ${f.asOf}.

DATA FACTS (computed by Seshat from retrieved datasets — authoritative):
${factLines(f.products.facts, 160)}

RETRIEVED SOURCES:
${blocks.join('\n\n')}

Build the evidence package:
- thesis: the article's central argument in 2–3 sentences, supported by the evidence.
- findings: key evidence points. claim in your own words; kind = documented / context / interpretation; sourceRefs = the S-refs supporting it ([] if it rests only on the data facts); quote = a short exact excerpt (≤ 300 chars, copied verbatim) from the source that supports it, or "".
- sourceFigures: important figures stated in the sources that the datasets do not cover (e.g. an announced production cut, a policy rate decision, an inventory change). figure = the exact text as written in the source (e.g. "2.2 million barrels per day"); quote = the exact sentence containing it, copied verbatim; key = camelCase name. Only figures you can quote verbatim. Describe each figure precisely: kind (level = an amount or price at a time; change = a difference between two times; rate = a growth rate or percentage), measure (stock = amount at a point in time e.g. inventories, backlog, debt; flow = amount per period e.g. production, sales, spending; price = cost per unit; rate; index; ratio; count; other), unit (e.g. "US$", "gigawatts", "barrels per day", "%"), denominator (what it is per, e.g. "MW", "kWh", "barrel", "year"; "" if none), temporal (historical = already happened; forecast/estimate/target = projected, estimated or planned), period (the year, quarter or date it refers to; "" if unstated).
- conflicts: where sources disagree, or are stale relative to the data.
- gaps: what the evidence cannot establish.
- sectionSupport: how well the evidence supports each of the four sections.`;
  const r = await deps.llm.complete({ stage: 'synthesize', system: SYSTEM, user, schema: SynthOut, maxTokens: 4200, temperature: 0.2 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const findings: FindingRow[] = r.data.findings.map((x, i) => {
    const refs = x.sourceRefs.filter((ref) => byRef.has(ref));
    const verified = !!x.quote && refs.some((ref) => quoteAppears(x.quote, `${byRef.get(ref)!.excerpt} ${byRef.get(ref)!.snippet}`));
    return { ref: `F${i + 1}`, claim: x.claim, evidence_kind: x.kind, source_refs: refs, quote: x.quote || null, quote_verified: verified };
  });
  const unverified = findings.filter((x) => x.quote && !x.quote_verified).length;
  if (unverified) ctx.warn(`${unverified} finding quote(s) could not be matched to the retrieved source text and are marked unverified.`);
  const sourceFacts: Record<string, Fact> = {};
  for (const sf of r.data.sourceFigures) {
    const s = byRef.get(sf.sourceRef);
    const ok = s && quoteAppears(sf.quote, `${s.excerpt} ${s.snippet}`) && figureInQuote(sf.figure, sf.quote);
    if (!ok) {
      ctx.warn(`Source figure "${sf.figure}" (${sf.sourceRef}) was not found verbatim in the source text; discarded.`);
      continue;
    }
    const key = `src${sf.key[0].toUpperCase()}${sf.key.slice(1)}`;
    const verified = verifyQuotedQuantity(sf.figure, sf.quote, sf);
    if (verified.notes.length) ctx.warn(`Source figure "${sf.figure}" (${sf.sourceRef}): ${verified.notes.join(' ')}`);
    sourceFacts[key] = {
      value: leadingNumber(sf.figure) ?? 0,
      format: 'text',
      text: sf.figure,
      decimals: 0,
      seriesIds: [],
      sourceRefs: [sf.sourceRef],
      method: `Quoted from ${sf.sourceRef} (${s!.publisher}${s!.published_at ? ', ' + s!.published_at : ''}): "${sf.quote.slice(0, 300)}" — ${sf.about}. Quantity: ${verified.quantity.kind}, ${verified.quantity.measure}, ${verified.quantity.unit}${verified.quantity.denominator ? ' per ' + verified.quantity.denominator : ''}, ${verified.quantity.temporal}${verified.quantity.period ? ' (' + verified.quantity.period + ')' : ''}.`.slice(0, 600),
      quantity: verified.quantity,
      quantityNotes: verified.notes.length ? verified.notes.map((n) => n.slice(0, 200)).slice(0, 6) : undefined,
    } as Fact;
  }
  await deps.store.replaceFindings(ctx.job.id, ctx.article.id, findings);
  for (const c of r.data.conflicts) ctx.warn(`Conflicting evidence: ${c.description}`);
  return { ...r.data, verifiedFindings: findings, sourceFacts };
}

// ── Shared context for the writing stages ──────────────────────────────────
function writingContext(ctx: StageContext): { facts: Record<string, Fact>; text: string } {
  const p = ctx.outputs.plan as PlanOut;
  const f = ctx.outputs.fetch as FetchOut;
  const s = ctx.outputs.synthesize as SynthResult;
  const facts = { ...f.products.facts, ...s.sourceFacts };
  const charts = Object.values(f.products.charts)
    .map((c) => `- ${c.id}: ${c.series.map((x) => x.label).join(' vs ')} (${c.series[0].points[0].date} → ${c.series[0].points.at(-1)!.date}${c.unit ? `, ${c.unit.label}` : ', %'})`)
    .join('\n');
  const indicators = f.products.indicators.map((i) => `- ${i.key}: ${i.label}`).join('\n');
  const findings = s.verifiedFindings
    .map((x) => `${x.ref} [${x.evidence_kind}${x.source_refs.length ? ' · ' + x.source_refs.join(',') : ''}${x.quote && !x.quote_verified ? ' · quote unverified' : ''}] ${x.claim}`)
    .join('\n');
  const text = `${briefBlock(ctx.article.brief)}

Central question: ${p.centralQuestion}
Angle: ${p.angle}
Why readers care: ${p.whyReadersCare}
Thesis: ${s.thesis}
Evidence support by section: ${Object.entries(s.sectionSupport).map(([k, v]) => `${k}=${v}`).join(', ')}
Gaps: ${s.gaps.join(' | ') || 'none noted'}

FINDINGS:
${findings}

FACT TOKENS (the ONLY way to state a number; copy tokens exactly; {key.date} gives the date):
${factLines(facts)}

DATE TOKENS (dates you may state):
${dateLines(f.products.dates)}

DATA OBSERVATIONS (deterministic statements about the data — superlatives and "since" claims must agree with these):
${(f.products.observations ?? []).join('\n')}

AVAILABLE CHARTS (reference by chartId; do not invent charts):
${charts || '(none)'}

AVAILABLE INDICATOR CARDS (reference by key):
${indicators || '(none)'}`;
  return { facts, text };
}

// ── G. The Story ────────────────────────────────────────────────────────────
async function story(ctx: StageContext) {
  const w = writingContext(ctx);
  const user = `${w.text}

${STORYBOARD}
Write THE STORY — "What happened, and why should I care?"
${VOICE}
- kicker: 1–3 words naming the beat (e.g. "Currencies", "Energy").
- headline: compelling, concise, specific; no clickbait, no question marks unless essential.
- dek: a one- or two-sentence summary of the central development.
- keyPoints: three short takeaways a reader should leave with ("the story in 30 seconds").
- blocks: the narrative — 6 to 10 paragraphs, each making a distinct point (never repeat a sentence or the key points verbatim) ({"type":"p"}), optionally one {"type":"h3"} subhead, at most one {"type":"pullquote"} and at most one {"type":"chart"} referencing an AVAILABLE chart with a question (chart title) and takeaway. Cover what happened, the relevant history and context, and why it matters to readers. The narrative must make sense without the chart.
- Use fact tokens for every figure. Keep the Story to the central argument; save mechanisms and scenarios for later sections.
${ATTENTION_RULE}`;
  const r = await ctx.deps.llm.complete({ stage: 'story', system: SYSTEM, user, schema: StorySection, maxTokens: 3600, temperature: 0.6 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  return r.data;
}

// ── H. Macro + Analytics ────────────────────────────────────────────────────
export const MacroAnalyticsOut = z.object({ macro: MacroSection, analytics: AnalyticsSection });

async function macroAnalytics(ctx: StageContext) {
  const w = writingContext(ctx);
  const st = ctx.outputs.story as z.infer<typeof StorySection>;
  const user = `${w.text}

The Story has been written with the headline "${st.headline}". Its summary: ${st.dek}

${STORYBOARD}
Write two sections as {"macro": {...}, "analytics": {...}}.

MACRO — "What do the economic and market numbers tell us?"
- title: an editorial heading; intro: 2–3 sentences connecting the numbers to the story.
- indicators: 2–4 AVAILABLE indicator keys with a one-sentence note each explaining why that number matters here.
- charts: 1–3 AVAILABLE charts (not the one already used in the Story, if any). For each: question = the specific editorial question it answers (chart title); takeaway = the one sentence a reader should leave with, citing only facts about the series in that chart.
- explainers: 2–3 short "what changed" notes (title, text, evidence).

ANALYTICS — "Why is this happening, and what are the consequences?"
- title, intro.
- chain: a transmission mechanism of 3–5 steps (e.g. policy gap → capital flows → currency → import prices). Each step: title, text, evidence (documented / context / interpretation).
- charts: 0–2 AVAILABLE charts that support the analysis (do not repeat charts used above).
- comparisons: 0–3 historical comparisons or context notes, only where evidence supports them.
- implications: title, intro, and 2–6 items (asset classes, businesses or household wealth). If the brief names specific groups (e.g. "first-time buyers, banks, homebuilders" or "utilities, independent power producers, grid-equipment makers"), include ONE item for EACH named group, up to 6. For each: asset name; icon (bonds / cash / stocks / property / currency / commodities); shows = what the data or sources show, with showsEvidence; couldMean = a careful interpretation.
- Never invent correlations, regression results, attribution percentages or backtests. Mark relationships honestly.
${VOICE}
${ATTENTION_RULE} (Apply it to each section's own attention field.)`;
  const r = await ctx.deps.llm.complete({ stage: 'macro_analytics', system: SYSTEM, user, schema: MacroAnalyticsOut, maxTokens: 5200, temperature: 0.45 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  return r.data;
}

// ── I. Outlook ──────────────────────────────────────────────────────────────
export const OutlookOut = OutlookSection.omit({ disclaimer: true });
export const OUTLOOK_DISCLAIMER =
  'These are conditional scenarios — editorial analysis of what could happen and what to watch, not forecasts, probabilities or investment advice. Outcomes depend on developments no one can predict with confidence.';

async function outlook(ctx: StageContext) {
  const w = writingContext(ctx);
  const ma = ctx.outputs.macro_analytics as z.infer<typeof MacroAnalyticsOut>;
  const user = `${w.text}

Analytics mechanism already described: ${ma.analytics.chain.steps.map((s) => s.title).join(' → ')}

${STORYBOARD}
Write the OUTLOOK — "What could happen next, and what should investors watch?"
- title, intro (2–3 sentences).
- scenarios: 2–3 conditional scenarios in a consistent format. Exactly one has role "central" (the path current evidence leans towards, NOT a probability); others "alternative". Each: key (short slug), name, summary, conditions (what would cause it), whyItMatters, assets (asset → plausible effect, conditional language), watch (specific indicators or events to monitor — name real indicators, ideally ones in this article), uncertainties (key counterarguments or unknowns).
- No probabilities, odds, confidence scores, price or rate targets, and no new numbers beyond fact tokens.
${VOICE}
${ATTENTION_RULE}`;
  const r = await ctx.deps.llm.complete({ stage: 'outlook', system: SYSTEM, user, schema: OutlookOut, maxTokens: 3800, temperature: 0.5 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  return r.data;
}

// ── Assembly (shared by repair + assemble + partial drafts) ────────────────
const PLACEHOLDER = (stage: string) => `[Not generated — the ${stage} stage did not complete. Write this section or retry generation.]`;

export function assembleArticle(ctx: StageContext, fixes: { path: string; text: string }[] = [], notes?: string[]): SeshatArticle {
  const { deps, outputs } = ctx;
  const p = outputs.plan as PlanOut | undefined;
  const f = outputs.fetch as FetchOut | undefined;
  const s = outputs.synthesize as SynthResult | undefined;
  const st = outputs.story as z.infer<typeof StorySection> | undefined;
  const ma = outputs.macro_analytics as z.infer<typeof MacroAnalyticsOut> | undefined;
  const ol = outputs.outlook as z.infer<typeof OutlookOut> | undefined;
  const srch = outputs.search as SearchOut | undefined;
  const now = deps.now().toISOString();
  const missing = (stage: string) => ({ required: true, reasons: [`The ${stage} stage did not complete.`] });

  const built: SeshatArticle = {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      workingTitle: (ctx.article.brief.headline || p?.workingTitle || ctx.article.working_title).slice(0, 200),
      section: p?.section ?? 'markets',
      author: { name: 'Seshat Editorial', role: 'Draft for editorial review' },
      asOf: f?.asOf ?? deps.today(),
      createdAt: ctx.job.created_at,
      updatedAt: now,
    },
    story: st ?? {
      kicker: 'Draft',
      headline: ctx.article.brief.headline || p?.workingTitle || ctx.article.working_title,
      dek: p?.centralQuestion ?? PLACEHOLDER('story'),
      keyPoints: [PLACEHOLDER('story')],
      blocks: [{ type: 'p', text: PLACEHOLDER('story') }],
      attention: missing('story'),
    },
    macro: ma?.macro ?? { title: 'Macro', intro: PLACEHOLDER('macro'), indicators: [], charts: [], explainers: [], attention: missing('macro') },
    analytics: ma?.analytics ?? {
      title: 'Analytics',
      intro: PLACEHOLDER('analytics'),
      chain: { title: 'How it works', steps: [{ title: 'To be written', text: PLACEHOLDER('analytics'), evidence: 'interpretation' }, { title: 'To be written', text: PLACEHOLDER('analytics'), evidence: 'interpretation' }] },
      charts: [],
      comparisons: [],
      implications: { title: 'What it could mean', intro: PLACEHOLDER('analytics'), items: [] },
      attention: missing('analytics'),
    },
    outlook: { ...(ol ?? { title: 'Outlook', intro: PLACEHOLDER('outlook'), scenarios: [], attention: missing('outlook') }), disclaimer: OUTLOOK_DISCLAIMER },
    methodology: [
      ...(f ? Object.values(f.products.series).map((x) => `${x.label}: ${x.derivation}`.slice(0, 600)) : []),
      'Every figure in this article is computed by Seshat’s application code from the datasets listed above, or quoted verbatim from a cited source; none is produced by the language model. Missing observations are left as gaps, never estimated.',
      'Charts show daily series as every fifth observation when the window exceeds roughly two and a half years; the underlying table lists the plotted points.',
      ...gapNotes(outputs),
    ].slice(0, 12),
    evidence: {
      citations: (srch?.sources ?? []).map((x) => ({ ref: x.ref, title: x.title, url: x.url, publisher: x.publisher, sourceType: x.source_type, publishedAt: x.published_at })),
      findings: (s?.verifiedFindings ?? []).map((x) => ({ ref: x.ref, claim: x.claim, kind: x.evidence_kind, sourceRefs: x.source_refs, quoteVerified: x.quote_verified })),
      gaps: evidenceGaps(outputs),
    },
    data: {
      facts: { ...(f?.products.facts ?? {}), ...(s?.sourceFacts ?? {}) },
      dates: f?.products.dates ?? {},
      charts: f?.products.charts ?? {},
      indicators: f?.products.indicators ?? [],
      sources: f?.products.sources ?? [],
    },
    validation: { checkedAt: now, issues: [] },
    generation: {
      jobId: ctx.job.id,
      model: deps.llm.model,
      searchProvider: deps.search.name,
      dataProviders: deps.data.filter((d) => d.enabled).map((d) => d.name),
      generatedAt: now,
    },
  };
  // Deep copy: stage outputs are shared objects and must never be mutated by fixes.
  const article: SeshatArticle = structuredClone(built);
  for (const fx of fixes) setPath(article, fx.path, fx.text);
  for (const k of resolveBareSeriesRefs(article)) notes?.push(k);
  dedupeUnits(article);
  fixSignWords(article);
  // Drop references to charts / indicators that do not exist (validator reports them first).
  const charts = article.data.charts as Record<string, unknown>;
  article.story.blocks = article.story.blocks.filter((b) => b.type !== 'chart' || charts[b.chartId]);
  article.macro.charts = article.macro.charts.filter((c) => charts[c.chartId]);
  article.analytics.charts = article.analytics.charts.filter((c) => charts[c.chartId]);
  const ind = new Set((article.data.indicators as { key: string }[]).map((i) => i.key));
  article.macro.indicators = article.macro.indicators.filter((i) => ind.has(i.key));
  return article;
}

/**
 * A token naming a series rather than one of its facts ({caseShillerSF}) is resolved to that
 * series' latest value ({caseShillerSFLatest}). Any other unknown reference stays and is flagged
 * by the validator as an error, so a broken figure never passes silently.
 */
export function resolveBareSeriesRefs(article: SeshatArticle): string[] {
  const facts = article.data.facts as Record<string, Fact>;
  const dates = article.data.dates as Record<string, unknown>;
  const resolved: string[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string')
      return v.replace(/\{([a-zA-Z0-9]+)(\.date)?\}/g, (m: string, key: string, date: string | undefined) => {
        if (facts[key] || dates[key] || !facts[`${key}Latest`]) return m;
        resolved.push(key);
        return `{${key}Latest${date ?? ''}}`;
      });
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  for (const sec of SECTION_ORDER) (article as Record<string, unknown>)[sec] = walk(article[sec]);
  return resolved;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "fell by {x}" where x < 0 would read "fell by −17.5%": use the magnitude form {x:abs}. */
export function fixSignWords(article: SeshatArticle): void {
  const facts = article.data.facts as Record<string, Fact>;
  const FALL = /\b(fell|fallen|falls|falling|dropped|drop|drops|declined|declines|decline|decreased|decrease|down|lost|loses|slid|slipped|slumped|shrank|shrunk|contracted|weakened|eased|retreated)(\s+(?:by|of|some|nearly|almost|about|roughly))?\s+\{([a-zA-Z0-9]+)\}/g;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(FALL, (m: string, verb: string, by: string | undefined, key: string) => (facts[key] && facts[key].value < 0 && facts[key].format !== 'text' ? `${verb}${by ?? ''} {${key}:abs}` : m));
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  for (const s of SECTION_ORDER) (article as Record<string, unknown>)[s] = walk(article[s]);
}

/** Tokens carry their own units: drop a unit/sign the model repeated around a token ("{brent} a barrel", "${brent}"). */
export function dedupeUnits(article: SeshatArticle): void {
  const facts = article.data.facts as Record<string, Fact>;
  const rules: [RegExp, string][] = [];
  for (const [k, f] of Object.entries(facts)) {
    const tok = `\\{${k}(?::abs)?\\}`;
    if (f.format === 'text' && f.text) {
      // Quoted figures carry their own qualifier and unit ("over 220 gigawatts"): drop a
      // repeated leading word ("over {x}") or a repeated trailing unit word ("{x} gigawatts").
      const words = f.text.trim().split(/\s+/);
      if (words.length > 1 && /^[a-z]+$/i.test(words[0])) rules.push([new RegExp(`\\b${esc(words[0])}\\s+(${tok})`, 'gi'), '$1']);
      const last = words[words.length - 1];
      if (words.length > 1 && /^[a-z/]+$/i.test(last)) rules.push([new RegExp(`(${tok})\\s+${esc(last)}\\b`, 'gi'), '$1']);
      continue;
    }
    if (f.format === 'pp') rules.push([new RegExp(`(${tok})\\s*(?:percentage points?|pp)\\b`, 'g'), '$1']);
    if (f.format === 'pct') rules.push([new RegExp(`(${tok})\\s*(?:%|per ?cent\\b)`, 'g'), '$1']);
    if (f.format !== 'level' || !f.unit) continue;
    if (f.unit.suffix.trim()) rules.push([new RegExp(`(${tok})\\s*${esc(f.unit.suffix.trim())}`, 'g'), '$1']);
    if (f.unit.prefix) rules.push([new RegExp(`${esc(f.unit.prefix)}\\s*(${tok})`, 'g'), '$1']);
    const word = CURRENCY_WORD[f.unit.prefix];
    if (word && !f.unit.suffix.trim()) rules.push([new RegExp(`(${tok})\\s+${word}\\b`, 'g'), '$1']);
  }
  if (!rules.length) return;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return rules.reduce((s, [re, to]) => s.replace(re, to), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  for (const s of SECTION_ORDER) (article as Record<string, unknown>)[s] = walk(article[s]);
}

const CURRENCY_WORD: Record<string, string> = { '¥': 'yen', $: '(?:US )?dollars?', '€': 'euros?', '£': 'pounds?' };
const TOKEN_RE = /\{[a-zA-Z0-9]+(?:\.date)?(?::(?:short|abs))?\}/;

/**
 * Qualify rather than overstate: an "In the data" (documented) label on text that cites no
 * data token is downgraded to "Established link" (context). Returns the paths changed.
 */
export function qualifyEvidence(article: SeshatArticle): string[] {
  const changed: string[] = [];
  const fix = <T extends { evidence?: string; showsEvidence?: string }>(items: T[], path: string, field: 'evidence' | 'showsEvidence', text: (x: T) => string) =>
    items.forEach((x, i) => {
      if (x[field] === 'documented' && !TOKEN_RE.test(text(x))) {
        (x as Record<string, unknown>)[field] = 'context';
        changed.push(`${path}[${i}]`);
      }
    });
  fix(article.macro.explainers, 'macro.explainers', 'evidence', (x) => x.text);
  fix(article.analytics.chain.steps, 'analytics.chain.steps', 'evidence', (x) => x.text);
  fix(article.analytics.comparisons, 'analytics.comparisons', 'evidence', (x) => x.text);
  fix(article.analytics.implications.items, 'analytics.implications.items', 'showsEvidence', (x) => x.shows);
  return changed;
}

/** Every piece of evidence the research needed but could not obtain, with the reason. */
/** Reader-facing method notes for missing evidence (outages are named, not hidden). */
function gapNotes(outputs: StageContext['outputs']): string[] {
  const gaps = evidenceGaps(outputs);
  const down = gaps.filter((g) => g.reason === 'provider-unavailable');
  const none = gaps.filter((g) => g.reason === 'no-dataset');
  const out: string[] = [];
  if (down.length) out.push(`Data not available for this draft because the provider was unreachable (${[...new Set(down.map((g) => g.provider))].join(', ')}): ${down.map((g) => g.need).join('; ')}. These gaps were not filled with substitute data.`.slice(0, 600));
  if (none.length) out.push(`No suitable public dataset was found for: ${none.map((g) => g.need).join('; ')}.`.slice(0, 600));
  return out;
}

export function evidenceGaps(outputs: StageContext['outputs']): Gap[] {
  const d = outputs.discover as DiscoverOut | undefined;
  const f = outputs.fetch as FetchOut | undefined;
  const sel = outputs.select as SelectOut | undefined;
  const all: Gap[] = [...(d?.gaps ?? []), ...(f?.gaps ?? []), ...(sel?.unmetNeeds ?? []).map((u) => ({ need: u.need, reason: 'no-dataset' as const, detail: u.why.slice(0, 300) }))];
  const seen = new Set<string>();
  return all.filter((g) => (seen.has(g.need) ? false : (seen.add(g.need), true))).map((g) => ({ ...g, need: g.need.slice(0, 300), detail: g.detail?.slice(0, 300), provider: g.provider?.slice(0, 80) }));
}

/** Set a string at a path like "story.blocks[2].text" (only existing string leaves). */
export function setPath(obj: unknown, path: string, value: string): boolean {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj as Record<string, unknown>;
  for (const k of parts.slice(0, -1)) {
    const next = cur?.[k];
    if (!next || typeof next !== 'object') return false;
    cur = next as Record<string, unknown>;
  }
  const last = parts.at(-1)!;
  if (typeof cur?.[last] !== 'string') return false;
  cur[last] = value;
  return true;
}

// ── J. Review (LLM editorial fact-check against the data; findings, not verification) ──
export const ReviewOut = z.object({
  problems: z.array(z.object({ path: z.string().max(120), problem: t(400), kind: z.enum(['contradicts-data', 'logic', 'unsupported', 'estimate-as-fact', 'inconsistent', 'repetition', 'other']) })).max(20),
});
export type ReviewOut = z.infer<typeof ReviewOut>;

const SKIP_LEAF = /\.attention\.|\.(chartId|key|icon|evidence|showsEvidence|role|type|kicker)$/;
const getPath = (obj: unknown, path: string): unknown => {
  let cur = obj;
  for (const k of path.replace(/\[(\d+)\]/g, '.$1').split('.')) cur = (cur as Record<string, unknown>)?.[k];
  return cur;
};

async function review(ctx: StageContext): Promise<ReviewOut & { checked: number }> {
  const draft = assembleArticle(ctx);
  const f = ctx.outputs.fetch as FetchOut | undefined;
  const s = ctx.outputs.synthesize as SynthResult | undefined;
  const tctx = { facts: draft.data.facts as Record<string, Fact>, dates: draft.data.dates as Record<string, DateFact> };
  const segs: string[] = [];
  for (const sec of SECTION_ORDER) for (const [path, text] of stringLeaves(draft[sec], sec)) if (!SKIP_LEAF.test(path) && text.length > 25) segs.push(`[${path}] ${resolveTokensSafe(text, tctx).slice(0, 700)}`);
  const user = `You are Seshat's fact-checking editor. Check this draft against the data observations, the evidence findings and sound economic reasoning.

DATA OBSERVATIONS (deterministic, authoritative):
${(f?.products.observations ?? []).join('\n')}

EVIDENCE FINDINGS:
${(s?.verifiedFindings ?? []).map((x) => `${x.ref} [${x.evidence_kind}] ${x.claim}`).join('\n')}

DRAFT (each line: [path] text, numbers already filled in):
${segs.join('\n')}

List only genuine problems, each with the exact [path]:
- contradicts-data: a statement that contradicts the observations (wrong direction, wrong magnitude, wrong date, a superlative the data does not show);
- logic: an economic-reasoning error (e.g. currency-translation direction, confusing a rate with a level, causation asserted from co-movement);
- estimate-as-fact: a forecast or estimate presented as a reported outcome;
- unsupported: a specific factual claim with no support in the findings or data;
- inconsistent: two passages that state different values or dates for the same thing;
- repetition: a sentence or point repeated nearly verbatim elsewhere (report the later occurrence).
Do not report style preferences. If there are no problems, return {"problems": []}.`;
  const r = await ctx.deps.llm.complete({ stage: 'review', system: SYSTEM, user, schema: ReviewOut, maxTokens: 2000, temperature: 0.1 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  const valid = r.data.problems.filter((p) => typeof getPath(draft, p.path) === 'string');
  return { problems: valid, checked: segs.length };
}

// ── K. Repair (LLM rewrites only strings the validator or reviewer flagged) ──
export const RepairOut = z.object({ fixes: z.array(z.object({ path: z.string().max(120), text: t(1600) })).max(40) });

async function repair(ctx: StageContext) {
  const draft = assembleArticle(ctx);
  const v = validateArticle(draft, { today: ctx.deps.today() });
  const REPAIRABLE = ['bare-number', 'unknown-token', 'unsupported-superlative', 'superlative-contradicted', 'style', 'duplicate-word'];
  const flagged = v.issues
    .filter((i) => (REPAIRABLE.includes(i.code) || i.code.startsWith('quantity:')) && i.path && !i.path.startsWith('methodology'))
    .map((i) => ({ path: i.path!, message: i.message }));
  for (const p of (ctx.outputs.review as ReviewOut | undefined)?.problems ?? []) flagged.push({ path: p.path, message: `Fact-check (${p.kind}): ${p.problem}` });
  const paths = [...new Set(flagged.map((i) => i.path))].slice(0, 30);
  if (!paths.length) return { fixes: [], skipped: true };
  const items = paths
    .map((path) => {
      const why = flagged.filter((i) => i.path === path).map((i) => i.message).join('; ');
      const text = String(getPath(draft, path));
      return `PATH ${path}\nMAX LENGTH ${Math.max(120, Math.round(text.length * 1.15))} characters\nPROBLEM ${why}\nTEXT ${text}`;
    })
    .join('\n\n');
  const f = ctx.outputs.fetch as FetchOut | undefined;
  const user = `Some passages in a Seshat draft were flagged by Seshat's validator or fact-checking editor: numbers that are not fact tokens, tokens that do not exist, superlatives ("highest", "five-year low", "above average"…) not backed by a data fact, clichés, repeated words, figures used as the wrong kind of quantity (a level presented as a change, a per-unit cost presented as an annual increase, a forecast stated as an outcome, the wrong period or unit), or factual/logical problems.

FACT TOKENS AVAILABLE:
${factLines(draft.data.facts as Record<string, Fact>)}
${dateLines(draft.data.dates as Record<string, { date: string; method: string }>)}

DATA OBSERVATIONS (deterministic — superlatives must agree with these):
${(f?.products.observations ?? []).join('\n')}

FLAGGED TEXT:
${items}

For each PATH, return the full corrected text (within its MAX LENGTH): use each figure only as what its description says it is (level vs change, its unit and denominator, its period, forecast vs historical); fix each factual or logical problem (correct it using the data and observations, or remove/qualify the claim); replace each flagged figure with the matching fact token if one exists, otherwise rewrite without that number; make each superlative either cite the matching high/low/since token in the same sentence or remove it if the observations do not support it; replace clichés with plain words. Keep everything else the same. Return {"fixes": [{"path": "...", "text": "..."}]}.`;
  const r = await ctx.deps.llm.complete({ stage: 'repair', system: SYSTEM, user, schema: RepairOut, maxTokens: 3000, temperature: 0.1 });
  ctx.metric({ llm: { ...r.usage, attempts: r.attempts } });
  return { fixes: r.data.fixes.filter((f) => paths.includes(f.path)), skipped: false };
}

// ── K. Assemble, validate, persist ─────────────────────────────────────────
export async function finalizeDraft(ctx: StageContext, opts: { partial: boolean }) {
  const { deps } = ctx;
  const fixes = ((ctx.outputs.repair as { fixes?: { path: string; text: string }[] } | undefined)?.fixes ?? []).slice();
  const resolvedRefs: string[] = [];
  let article = assembleArticle(ctx, fixes, resolvedRefs);
  // A repair rewrite that breaks a field's schema limits (e.g. too long) is discarded:
  // the original text is kept and the editor is told, rather than failing the draft.
  const rejectedFixes: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const check = SeshatArticleV1.safeParse(article);
    if (check.success) break;
    const bad = new Set(check.error.issues.map((i) => i.path.map((x) => (typeof x === 'number' ? `[${x}]` : `.${String(x)}`)).join('').replace(/^\./, '').replace(/\.\[/g, '[')));
    const drop = fixes.filter((f) => bad.has(f.path));
    if (!drop.length) break;
    rejectedFixes.push(...drop.map((f) => f.path));
    fixes.splice(0, fixes.length, ...fixes.filter((f) => !bad.has(f.path)));
    article = assembleArticle(ctx, fixes);
  }
  for (const path of rejectedFixes) ctx.warn(`A fact-check rewrite of ${path} broke the field's limits and was discarded; the original text was kept — please review it.`);
  const requalified = qualifyEvidence(article);
  const outageGaps = (article.evidence.gaps ?? []).filter((g) => g.reason === 'provider-unavailable');
  if (outageGaps.length)
    article.macro.attention = {
      required: true,
      reasons: [...article.macro.attention.reasons, `Missing evidence (provider unavailable): ${outageGaps.map((g) => g.need).join('; ')}`.slice(0, 380)].slice(0, 10),
    };
  // Recompute every data fact from the stored datasets — what is displayed is what is validated.
  let recomputed: Record<string, Fact> | undefined;
  const sel = ctx.outputs.select as SelectOut | undefined;
  if (ctx.outputs.fetch && sel) {
    const rows = await deps.store.getDatasets(ctx.job.id);
    recomputed = productsFromSelection(rows, sel, deps.data).facts;
  }
  const v = validateArticle(article, { today: deps.today(), recomputedFacts: recomputed });
  article = applyAttention(v.article ?? article, v.issues);
  for (const p of (ctx.outputs.review as ReviewOut | undefined)?.problems ?? [])
    v.issues.push({ level: 'info', section: (SECTION_ORDER as readonly string[]).includes(p.path.split('.')[0]) ? (p.path.split('.')[0] as 'story') : 'evidence', code: 'review-revised', message: `Fact-check flagged and the passage was revised — please confirm: ${p.problem}`, path: p.path });
  for (const k of [...new Set(resolvedRefs)])
    v.issues.push({ level: 'info', section: 'evidence', code: 'reference-resolved', message: `{${k}} named a dataset rather than a figure; it was read as its latest value {${k}Latest} — please confirm` });
  for (const path of requalified)
    v.issues.push({ level: 'info', section: path.startsWith('macro') ? 'macro' : 'analytics', code: 'evidence-qualified', message: 'Relabelled from "In the data" to "Established link": it cites no data value', path });
  article.validation = { checkedAt: deps.now().toISOString(), issues: v.issues, claims: v.claims };
  if (!v.article) throw Object.assign(new Error(`Assembled article failed schema validation: ${v.issues.map((i) => i.message).join('; ').slice(0, 400)}`), { retryable: false });
  const needs = opts.partial || SECTION_ORDER.some((sec) => article[sec].attention.required) || v.issues.some((i) => i.level === 'error');
  const current = await deps.store.getArticle(ctx.article.id);
  const revision = (current?.revision ?? 0) + 1;
  // Never overwrite human edits: if the editor has already worked on this draft,
  // keep their version current and store the new generation only as a revision.
  const editorOwned = (await deps.store.latestRevisionOrigin(ctx.article.id)) === 'editor';
  await deps.store.insertRevision(ctx.article.id, revision, 'generated', article, editorOwned ? 'Generated after editor changes — not applied; compare and copy manually' : opts.partial ? 'Partial draft saved after a generation failure' : 'Generated draft');
  if (editorOwned) {
    await deps.store.updateArticle(ctx.article.id, { revision });
    ctx.warn(`The editor had already edited this draft, so the newly generated version was saved as revision ${revision} without replacing the editor's text.`);
    return { revision, errors: 0, warnings: 0, status: current?.status ?? 'needs_attention', editorPreserved: true };
  }
  await deps.store.updateArticle(ctx.article.id, {
    content: article,
    revision,
    status: opts.partial ? 'generation_failed' : needs ? 'needs_attention' : 'draft',
    working_title: article.meta.workingTitle,
    schema_version: SCHEMA_VERSION,
    as_of: article.meta.asOf,
  });
  const errors = v.issues.filter((i) => i.level === 'error').length;
  const warnings = v.issues.filter((i) => i.level === 'warning').length;
  return { revision, errors, warnings, status: opts.partial ? 'generation_failed' : needs ? 'needs_attention' : 'draft' };
}

async function assemble(ctx: StageContext) {
  return finalizeDraft(ctx, { partial: false });
}

export const STAGE_IMPL: Record<Stage, (ctx: StageContext) => Promise<unknown>> = {
  plan,
  search,
  discover,
  select,
  fetch: fetchData,
  synthesize,
  story,
  macro_analytics: macroAnalytics,
  outlook,
  review,
  repair,
  assemble,
};

export { noAttention };
export type { StoryBrief };
