// Phase 3B.2 editorial evaluation — controlled before/after comparison.
//
// For each article: reload the job's STORED stage outputs (same brief, same
// research, same evidence, same datasets, same model), then re-run the
// writing stages with
//   (a) the ORIGINAL prompts, extracted verbatim from a baseline git commit, and
//   (b) the REVISED prompts in the working tree,
// and run Editorial Polish on the article's CURRENT prose. Everything happens
// in memory: no draft, revision or publication is written (the only database
// write is the api_usage ledger, stage "evaluation"). Arli calls run strictly
// one at a time (D-010).
//
// Usage: node scripts/studio/editorial-eval.ts [--baseline b1cdb61] [--out docs/editorial/evaluation]
// Credentials come from .env.local; nothing secret is printed.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { arliLlm, type Llm, type LlmRequest } from '../../lib/studio/llm.ts';
import { STAGE_IMPL } from '../../lib/studio/pipeline/stages.ts';
import { SYSTEM } from '../../lib/studio/pipeline/prompts.ts';
import type { StageContext, Stage } from '../../lib/studio/pipeline/types.ts';
import { SeshatArticleV1, StoryBrief, type SeshatArticle } from '../../lib/studio/schema.ts';
import { resolveTokensSafe } from '../../lib/content/tokens.ts';
import { checkTokens, findBareNumbers } from '../../lib/studio/numbers.ts';
import { buildProposal, polishPrompt, PolishOut } from '../../lib/editorial/polish.ts';
import { proseSignals, repetitionShare, tokensRestated } from '../../lib/editorial/signals.ts';
import { STYLE_GUIDE_VERSION } from '../../lib/editorial/style-guide.ts';

const env = readEnv() as Record<string, string>;
const args = process.argv.slice(2);
const arg = (name: string, d: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
const BASELINE = arg('--baseline', 'b1cdb61');
const OUT = arg('--out', 'docs/editorial/evaluation');
/** Partial re-run: --redo revised,polish recomputes only those parts and keeps the rest from the previous results.json (replaced parts are kept as <part>Previous). Default: everything. */
const REDO = new Set(arg('--redo', 'original,revised,polish').split(','));
const previous = REDO.size < 3 ? (JSON.parse(readFileSync(`${OUT}/results.json`, 'utf8')) as { meta: Record<string, unknown>; results: Record<string, unknown>[] }) : null;

/** The evaluation set: three editorial categories. `argument` variants are clearly labelled stand-ins written for the test, not the author's words. */
const CASES: { id: string; label: string; category: string; full?: boolean; argumentVariant?: string }[] = [
  { id: 'cfd2cbb8-435b-45ae-9b96-e90fb1d70bf5', label: 'Inflation (published article)', category: 'Consumer-oriented macro storytelling', full: true },
  { id: 'adf41c39-4aa7-4219-97a1-a81a7a09fcb2', label: 'US housing', category: 'Market / asset-specific analysis' },
  {
    id: '1ea0ea22-492a-49e5-a29b-89be7ab5ce7a',
    label: 'Nvidia and the AI bubble',
    category: 'Opinionated financial commentary',
    argumentVariant:
      'TEST STAND-IN (written for this evaluation, not by the author): The AI boom is not a dot-com rerun because the money is real, but the way it is financed — suppliers funding their own customers — is exactly how bubbles hide. The risk is the plumbing, not the technology.',
  },
];

// ── Original prompts from the baseline commit (temporary copies, removed at exit) ──
const LEGACY_PROMPTS = 'lib/studio/pipeline/legacy-prompts.eval.ts';
const LEGACY_STAGES = 'lib/studio/pipeline/legacy-stages.eval.ts';
writeFileSync(LEGACY_PROMPTS, execSync(`git show ${BASELINE}:lib/studio/pipeline/prompts.ts`));
writeFileSync(LEGACY_STAGES, execSync(`git show ${BASELINE}:lib/studio/pipeline/stages.ts`).toString().replace("from './prompts.ts'", "from './legacy-prompts.eval.ts'"));
const legacy = (await import(`../../${LEGACY_STAGES}`)) as { STAGE_IMPL: typeof STAGE_IMPL };
process.on('exit', () => {
  rmSync(LEGACY_PROMPTS, { force: true });
  rmSync(LEGACY_STAGES, { force: true });
});

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
{
  const { error } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
}
const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
if (active?.length) throw new Error('a generation job is running; Arli allows one request at a time — try later');

const base = arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model: env.ARLI_MODEL, timeoutMs: 240_000 });
const ledger: { label: string; stage: string; promptTokens: number; completionTokens: number; seconds: number }[] = [];
let current = '';
const llm: Llm = {
  model: base.model,
  async complete<T>(req: LlmRequest<T>) {
    const t0 = Date.now();
    const r = await base.complete(req);
    ledger.push({ label: current, stage: req.stage, ...r.usage, seconds: Math.round((Date.now() - t0) / 1000) });
    await db.from('api_usage').insert({ job_id: null, article_id: null, stage: 'evaluation', service: 'arli', key_fingerprint: createHash('sha256').update(env.ARLI_API_KEY).digest('hex').slice(0, 12), model: env.ARLI_MODEL, prompt_tokens: r.usage.promptTokens, completion_tokens: r.usage.completionTokens, credits: 0, calls: r.attempts }).then(() => undefined, () => undefined);
    console.log(`  · ${current} ${req.stage}: ${r.usage.promptTokens}+${r.usage.completionTokens} tokens, ${Math.round((Date.now() - t0) / 1000)}s`);
    return r;
  },
};

type Story = { headline: string; dek: string; keyPoints: string[]; blocks: { type: string; text?: string; chartId?: string }[] };
type MA = { macro: { title: string; intro: string; indicators: { note: string }[]; explainers: { text: string }[] }; analytics: { title: string; intro: string; chain: { steps: { title: string; text: string }[] }; comparisons: { text: string }[]; implications: { intro: string; items: { shows: string; couldMean: string }[] } } };
type Out = { title: string; intro: string; scenarios: { name: string; summary: string; whyItMatters: string; watch: string[] }[] };

const storyParas = (s: Story) => s.blocks.filter((b) => b.type === 'p' || b.type === 'pullquote').map((b) => b.text!);
const maParas = (m: MA) => [m.macro.intro, ...m.macro.indicators.map((i) => i.note), ...m.macro.explainers.map((e) => e.text), m.analytics.intro, ...m.analytics.chain.steps.map((s) => s.text), ...m.analytics.comparisons.map((c) => c.text), m.analytics.implications.intro];
const outParas = (o: Out) => [o.intro, ...o.scenarios.flatMap((s) => [s.summary, s.whyItMatters])];

function numberDiscipline(texts: string[], facts: Record<string, unknown>, dates: Record<string, unknown>) {
  const all = texts.join('\n');
  return { unknownTokens: checkTokens(all, facts, dates).map((p) => p.token), bareNumbers: findBareNumbers(all).map((b) => b.match) };
}

const results: Record<string, unknown>[] = [];
try {
  for (const c of CASES) {
    console.log(`\n${c.label}`);
    const { data: art } = await db.from('articles').select('id, brief, content, revision').eq('id', c.id).single();
    const content = SeshatArticleV1.parse(art!.content) as SeshatArticle;
    const brief = StoryBrief.parse(art!.brief);
    const jobId = content.generation.jobId;
    const { data: runs } = await db.from('job_stage_runs').select('stage, output, id').eq('job_id', jobId).eq('status', 'succeeded').order('id');
    const stored: Partial<Record<Stage, unknown>> = {};
    for (const r of runs ?? []) stored[r.stage as Stage] = r.output;
    for (const need of ['plan', 'fetch', 'synthesize', 'story'] as Stage[]) if (!stored[need]) throw new Error(`${c.label}: stored output for ${need} missing`);

    const fetchOut = stored.fetch as { products: { facts: Record<string, unknown>; dates: Record<string, unknown> } };
    const synthOut = stored.synthesize as { sourceFacts?: Record<string, unknown> };
    const facts = { ...fetchOut.products.facts, ...(synthOut.sourceFacts ?? {}) };
    const dates = fetchOut.products.dates;
    const resolve = (s: string) => resolveTokensSafe(s, { facts: facts as never, dates: dates as never });

    const ctxFor = (b: typeof brief, outputs: Partial<Record<Stage, unknown>>): StageContext =>
      ({
        deps: { llm, today: () => content.meta.asOf, now: () => new Date() },
        job: { id: jobId },
        article: { id: c.id, brief: b },
        outputs,
        warn: (m: string) => console.log(`    warn: ${m.slice(0, 160)}`),
        metric: () => undefined,
      }) as unknown as StageContext;
    const base0 = { plan: stored.plan, search: stored.search, discover: stored.discover, select: stored.select, fetch: stored.fetch, synthesize: stored.synthesize };

    const run = async (impl: typeof STAGE_IMPL, b: typeof brief, label: string, full: boolean) => {
      current = `${c.label} / ${label}`;
      const outputs: Partial<Record<Stage, unknown>> = { ...base0 };
      const story = (await impl.story(ctxFor(b, outputs))) as Story;
      outputs.story = story;
      let ma: MA | undefined;
      let out: Out | undefined;
      if (full) {
        ma = (await impl.macro_analytics(ctxFor(b, outputs))) as MA;
        outputs.macro_analytics = ma;
        out = (await impl.outlook(ctxFor(b, outputs))) as Out;
      }
      const texts = [story.headline, story.dek, ...story.keyPoints, ...storyParas(story), ...(ma ? maParas(ma) : []), ...(out ? outParas(out) : [])];
      const storyText = [story.dek, ...story.keyPoints, ...storyParas(story)].join('\n');
      return {
        label,
        story: { headline: resolve(story.headline), dek: resolve(story.dek), keyPoints: story.keyPoints.map(resolve), paragraphs: storyParas(story).map(resolve), subheads: story.blocks.filter((x) => x.type === 'h3').length },
        macroAnalytics: ma ? { macroTitle: ma.macro.title, macroIntro: resolve(ma.macro.intro), analyticsTitle: ma.analytics.title, analyticsIntro: resolve(ma.analytics.intro), chain: ma.analytics.chain.steps.map((s) => `${s.title}: ${resolve(s.text)}`) } : undefined,
        outlook: out ? { title: out.title, intro: resolve(out.intro), scenarios: out.scenarios.map((s) => ({ name: s.name, summary: resolve(s.summary), whyItMatters: resolve(s.whyItMatters), watch: s.watch.map(resolve) })) } : undefined,
        signals: { story: proseSignals(storyParas(story).map(resolve)), ...(ma && out ? { laterSections: proseSignals([...maParas(ma), ...outParas(out)].map(resolve)) } : {}) },
        repetition: ma && out ? { macroAnalyticsVsStory: repetitionShare(storyText, maParas(ma).join('\n')), outlookVsEarlier: repetitionShare(storyText + '\n' + maParas(ma).join('\n'), outParas(out).join('\n')), factTokensRestatedAcrossSections: tokensRestated({ story: storyText, ma: maParas(ma).join('\n'), outlook: outParas(out).join('\n') }).length } : undefined,
        numberDiscipline: numberDiscipline(texts, facts, dates),
      };
    };

    const prev = previous?.results.find((r) => r.id === c.id);
    const original = prev && !REDO.has('original') ? prev.original : await run(legacy.STAGE_IMPL, brief, 'original prompts', !!c.full);
    const revised = prev && !REDO.has('revised') ? prev.revised : await run(STAGE_IMPL, brief, 'revised prompts', !!c.full);
    const withArgument = prev && !REDO.has('revised') ? prev.withArgument : c.argumentVariant ? await run(STAGE_IMPL, { ...brief, argument: c.argumentVariant }, 'revised prompts + stand-in author argument', false) : undefined;

    // Editorial Polish on the CURRENT prose of the Story (and Outlook for the full case), no DB write.
    const polish: Record<string, unknown>[] = [];
    for (const section of !REDO.has('polish') ? [] : c.full ? (['story', 'outlook'] as const) : (['story'] as const)) {
      current = `${c.label} / polish ${section}`;
      const { user, fields } = polishPrompt(content, section, brief);
      const budget = Math.min(6000, 600 + Math.round(fields.reduce((n, f) => n + f.text.length, 0) / 2.5));
      const r = await llm.complete({ stage: 'polish', system: SYSTEM, user, schema: PolishOut, maxTokens: budget, temperature: 0.5 });
      const p = buildProposal(content, section, art!.revision, r.data);
      polish.push({
        section,
        fields: fields.length,
        changed: p.items.length,
        ok: p.items.filter((i) => i.check.status === 'ok').length,
        flagged: p.items.filter((i) => i.check.status === 'flagged').length,
        rejected: p.items.filter((i) => i.check.status === 'rejected').length,
        discarded: p.discarded,
        concerns: p.concerns,
        items: p.items.map((i) => ({ path: i.path, label: i.label, status: i.check.status, reasons: i.check.reasons.map((x) => `${x.severity}: ${x.message}`), before: resolve(i.before), after: resolve(i.after) })),
        signalsBefore: proseSignals(fields.filter((f) => /blocks|intro|summary|whyItMatters/.test(f.path)).map((f) => resolve(f.text))),
        signalsAfter: proseSignals(fields.filter((f) => /blocks|intro|summary|whyItMatters/.test(f.path)).map((f) => resolve(p.items.find((i) => i.path === f.path)?.after ?? f.text))),
      });
    }

    results.push({
      id: c.id,
      label: c.label,
      category: c.category,
      revision: art!.revision,
      brief: { prompt: brief.prompt, angle: brief.angle, audience: brief.audience },
      argumentVariant: c.argumentVariant,
      currentArticle: { headline: resolve(content.story.headline), dek: resolve(content.story.dek), paragraphs: storyParas(content.story as Story).map(resolve), signals: proseSignals(storyParas(content.story as Story).map(resolve)) },
      original,
      revised,
      withArgument,
      polish,
      ...(prev ? Object.fromEntries([...REDO].filter((k) => k !== 'original').map((k) => [k === 'revised' ? 'revisedPrevious' : 'polishPrevious', k === 'revised' ? prev.revised : prev.polish])) : {}),
      ...(prev && !REDO.has('polish') ? { polish: prev.polish } : {}),
      ...(prev?.polishPrevious && !REDO.has('polish') ? { polishPrevious: prev.polishPrevious } : {}),
    });
  }
} finally {
  mkdirSync(OUT, { recursive: true });
  const meta = { ...(previous ? { abRun: previous.meta } : {}), redo: [...REDO], generatedAt: new Date().toISOString(), baselineCommit: BASELINE, styleGuideVersion: STYLE_GUIDE_VERSION, model: env.ARLI_MODEL, note: 'Single samples per variant (temperature as in production); differences within one sample are indicative, not statistically established. Signals are diagnostics, not quality or AI-detection scores.', ledger, totals: { calls: ledger.length, promptTokens: ledger.reduce((a, b) => a + b.promptTokens, 0), completionTokens: ledger.reduce((a, b) => a + b.completionTokens, 0), seconds: ledger.reduce((a, b) => a + b.seconds, 0) } };
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ meta, results }, null, 2));
  console.log(`\nwrote ${OUT}/results.json · ${meta.totals.calls} calls · ${meta.totals.promptTokens}+${meta.totals.completionTokens} tokens · ${meta.totals.seconds}s`);
  await db.auth.signOut();
}
