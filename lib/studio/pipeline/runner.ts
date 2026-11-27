// Step runner: executes exactly ONE pipeline stage per call, under a job
// lease, persisting the stage output before moving on. Called repeatedly by
// the studio (each call fits inside one serverless invocation). Completed
// stages are never re-run; a failed stage is retried alone.
import { LlmError } from '../llm.ts';
import { ProviderError } from '../providers/http.ts';
import { STAGE_IMPL, finalizeDraft } from './stages.ts';
import { STAGES, type Deps, type Job, type Stage, type StageContext, type StageMetrics, type Warning } from './types.ts';

export const LEASE_SECONDS = 290; // < Vercel's 300 s function limit
export const MAX_ATTEMPTS = 3;

export type StepResult =
  | { kind: 'busy'; job: Job | null }
  | { kind: 'ran'; stage: Stage; ok: boolean; job: Job }
  | { kind: 'idle'; job: Job | null };

const isRetryable = (e: unknown) =>
  e instanceof LlmError || e instanceof ProviderError ? e.retryable : Boolean((e as { retryable?: boolean })?.retryable ?? true);

export async function runStep(deps: Deps, jobId: string): Promise<StepResult> {
  const current = await deps.store.getJob(jobId);
  if (!current || !['queued', 'running'].includes(current.status) || current.stage === 'done') return { kind: 'idle', job: current };
  const job = await deps.store.claimJob(jobId, LEASE_SECONDS);
  if (!job) return { kind: 'busy', job: current };
  const token = job.lease_token!;
  const stage = job.stage as Stage;
  const article = await deps.store.getArticle(job.article_id);
  if (!article) {
    await deps.store.releaseJob(jobId, token, { status: 'failed', error: { stage, message: 'Article not found', retryable: false, at: deps.now().toISOString() }, finished: true });
    return { kind: 'ran', stage, ok: false, job: (await deps.store.getJob(jobId))! };
  }

  const attempt = (job.attempts[stage] ?? 0) + 1;
  const warnings: Warning[] = [...job.warnings];
  const metrics: StageMetrics = { ms: 0 };
  const ctx: StageContext = {
    deps,
    job,
    article,
    outputs: await deps.store.stageOutputs(jobId),
    warn: (message) => warnings.push({ stage, message }),
    metric: (m) => Object.assign(metrics, m),
  };
  const runId = await deps.store.startRun(jobId, stage, attempt);
  const t0 = Date.now();
  const recordMetrics = () => {
    metrics.ms = Date.now() - t0;
    const all = { ...(job.metrics.stages ?? {}) };
    all[stage] = [...(all[stage] ?? []), metrics];
    return { ...job.metrics, startedAt: job.metrics.startedAt ?? new Date(t0).toISOString(), stages: all };
  };

  try {
    const output = await STAGE_IMPL[stage](ctx);
    const m = recordMetrics();
    await deps.store.finishRun(runId, 'succeeded', output, null, metrics);
    const next = STAGES[STAGES.indexOf(stage) + 1];
    const done = !next;
    await deps.store.releaseJob(jobId, token, {
      stage: done ? 'done' : next,
      status: done ? 'succeeded' : 'running',
      attempts: { ...job.attempts, [stage]: attempt },
      error: null,
      warnings: dedupe(warnings),
      metrics: done ? { ...m, finishedAt: deps.now().toISOString() } : m,
      finished: done,
    });
    return { kind: 'ran', stage, ok: true, job: (await deps.store.getJob(jobId))! };
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    const retryable = isRetryable(e) && attempt < MAX_ATTEMPTS;
    if (e instanceof LlmError) metrics.llm = { ...e.usage, attempts: 2 };
    const m = recordMetrics();
    await deps.store.finishRun(runId, 'failed', null, message.slice(0, 2000), metrics);
    const error = { stage, message: message.slice(0, 1000), retryable, at: deps.now().toISOString() };
    if (!retryable) {
      // Preserve whatever was produced: save a partial, clearly-flagged draft once data exists.
      try {
        if (ctx.outputs.plan && stage !== 'assemble') await finalizeDraft({ ...ctx, outputs: ctx.outputs }, { partial: true });
        else await deps.store.updateArticle(article.id, { status: 'generation_failed' });
      } catch (inner) {
        warnings.push({ stage, message: `Could not save a partial draft: ${(inner as Error).message}` });
        await deps.store.updateArticle(article.id, { status: 'generation_failed' });
      }
    }
    await deps.store.releaseJob(jobId, token, {
      status: retryable ? 'running' : 'failed',
      attempts: { ...job.attempts, [stage]: attempt },
      error,
      warnings: dedupe(warnings),
      metrics: m,
      finished: !retryable,
    });
    return { kind: 'ran', stage, ok: false, job: (await deps.store.getJob(jobId))! };
  }
}

const dedupe = (w: Warning[]) => {
  const seen = new Set<string>();
  return w.filter((x) => (seen.has(x.stage + x.message) ? false : (seen.add(x.stage + x.message), true))).slice(-80);
};

/** Aggregate metrics for reporting (durations, tokens, calls, credits). */
export function summarizeMetrics(job: Job) {
  const stages = job.metrics.stages ?? {};
  let ms = 0, prompt = 0, completion = 0, credits = 0, llmCalls = 0;
  const calls: Record<string, number> = {};
  const perStage: Record<string, { ms: number; runs: number; tokens: number }> = {};
  for (const [stage, runs] of Object.entries(stages)) {
    for (const r of runs ?? []) {
      ms += r.ms;
      if (r.llm) {
        prompt += r.llm.promptTokens;
        completion += r.llm.completionTokens;
        llmCalls += r.llm.attempts;
      }
      credits += r.credits ?? 0;
      for (const [k, v] of Object.entries(r.calls ?? {})) calls[k] = (calls[k] ?? 0) + v;
      const p = (perStage[stage] ??= { ms: 0, runs: 0, tokens: 0 });
      p.ms += r.ms;
      p.runs += 1;
      p.tokens += (r.llm?.promptTokens ?? 0) + (r.llm?.completionTokens ?? 0);
    }
  }
  return { ms, promptTokens: prompt, completionTokens: completion, llmCalls, searchCredits: credits, calls, perStage };
}
