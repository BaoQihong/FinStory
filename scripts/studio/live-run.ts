// Live integration run of the generation engine against the REAL providers
// (Arli, Tavily, FRED, Tiingo, EIA if configured) with an in-memory store —
// for engine debugging and measurement without touching the database. The
// acceptance tests themselves run through the studio UI (Supabase-backed).
//
// Usage: node scripts/studio/live-run.ts "<prompt>" [outfile.json]
// Never prints secrets; output JSON contains the article, warnings and metrics.
import { writeFileSync } from 'node:fs';
import { readEnv } from '../lib/env-file.mjs';
import { arliLlm } from '../../lib/studio/llm.ts';
import { tavilyProvider } from '../../lib/studio/providers/tavily.ts';
import { fredProvider } from '../../lib/studio/providers/fred.ts';
import { tiingoProvider } from '../../lib/studio/providers/tiingo.ts';
import { eiaProvider } from '../../lib/studio/providers/eia.ts';
import { MemoryStore } from '../../lib/studio/pipeline/memory-store.ts';
import { runStep, summarizeMetrics } from '../../lib/studio/pipeline/runner.ts';
import { StoryBrief, type SeshatArticle } from '../../lib/studio/schema.ts';
import { resolveTokensSafe } from '../../lib/content/tokens.ts';

const env = readEnv() as Record<string, string>;
const prompt = process.argv[2];
const out = process.argv[3] ?? 'live-run.json';
if (!prompt) throw new Error('prompt required');

const store = new MemoryStore();
const deps = {
  store,
  llm: arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model: env.ARLI_MODEL }),
  search: tavilyProvider(env.TAVILY_API_KEY),
  data: [fredProvider(env.FRED_API_KEY), tiingoProvider(env.TIINGO_API_KEY), eiaProvider(env.EIA_API_KEY)],
  today: () => new Date().toISOString().slice(0, 10),
  now: () => new Date(),
};
const { articleId, jobId } = store.createArticleAndJob({ working_title: prompt.slice(0, 100), brief: StoryBrief.parse({ prompt }) });
const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  const r = await runStep(deps, jobId);
  if (r.kind === 'idle') break;
  if (r.kind === 'ran') {
    const m = r.job.metrics.stages?.[r.stage]?.at(-1);
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.stage.padEnd(16)} ${((m?.ms ?? 0) / 1000).toFixed(1).padStart(6)} s${m?.llm ? `  tokens ${m.llm.promptTokens}+${m.llm.completionTokens} (attempts ${m.llm.attempts})` : ''}${r.ok ? '' : '  ' + r.job.error?.message}`);
  }
}
const job = (await store.getJob(jobId))!;
const art = (await store.getArticle(articleId))!;
const c = art.content as SeshatArticle | null;
const metrics = summarizeMetrics(job);
console.log(`\nstatus ${job.status} · article ${art.status} · wall ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('metrics', JSON.stringify({ ...metrics, perStage: undefined }));
console.log(`warnings (${job.warnings.length}):`);
for (const w of job.warnings) console.log(`  [${w.stage}] ${w.message}`);
if (c) {
  const ctx = { facts: c.data.facts as never, dates: c.data.dates as never };
  console.log(`\nHEADLINE ${resolveTokensSafe(c.story.headline, ctx)}\nDEK ${resolveTokensSafe(c.story.dek, ctx)}`);
  for (const b of c.story.blocks) console.log(`  ${b.type === 'chart' ? `[chart ${b.chartId}] ${b.question}` : resolveTokensSafe(b.text, ctx)}`);
  console.log(`\ndatasets: ${(await store.getDatasets(jobId)).map((d) => `${d.provider}:${d.series_id}`).join(', ')}`);
  console.log(`charts: ${Object.keys(c.data.charts).join(', ')} · macro uses ${c.macro.charts.map((x) => x.chartId)} · analytics uses ${c.analytics.charts.map((x) => x.chartId)}`);
  console.log(`scenarios: ${c.outlook.scenarios.map((s) => `${s.name} (${s.role})`).join(' | ')}`);
  console.log(`issues: ${c.validation.issues.map((i) => `${i.level}:${i.code}@${i.path ?? i.section}`).join(', ')}`);
  console.log(`attention: ${['story', 'macro', 'analytics', 'outlook'].map((s) => `${s}=${(c as never as Record<string, { attention: { required: boolean } }>)[s].attention.required}`).join(' ')}`);
}
writeFileSync(out, JSON.stringify({ job, article: art, sources: await store.getSources(jobId), datasets: (await store.getDatasets(jobId)).map((d) => ({ ...d, observations: d.observations.length })) }, null, 2));
console.log(`\nwrote ${out}`);
