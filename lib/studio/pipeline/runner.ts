// Step runner: executes exactly ONE pipeline stage per call, under a job
// lease, persisting the stage output before moving on. Called repeatedly by
// the studio (each call fits inside one serverless invocation). Completed
// stages are never re-run; a failed stage is retried alone.
import { LlmError } from '../llm.ts';
import { ProviderError } from '../providers/http.ts';
import { STAGE_IMPL, finalizeDraft } from './stages.ts';
import { STAGES, type Deps, type Job, type Service, type Stage, type StageContext, type StageMetrics, type UsageRow, type Warning } from './types.ts';

/** Ledger rows for one stage run: model tokens, search credits and data calls, per service and key. */
export function usageRows(deps: Deps, job: Job, stage: Stage, m: StageMetrics): UsageRow[] {
  const rows: UsageRow[] = [];
  const base = { job_id: job.id, article_id: job.article_id, stage, prompt_tokens: 0, completion_tokens: 0, credits: 0, calls: 0, model: null as string | null };
  const fp = (s: Service) => deps.keyFingerprints[s] ?? 'unknown';
  if (m.llm && (m.llm.promptTokens || m.llm.completionTokens))
    rows.push({ ...base, service: 'arli', key_fingerprint: fp('arli'), model: m.llm.model ?? deps.llm.model, prompt_tokens: m.llm.promptTokens, completion_tokens: m.llm.completionTokens, calls: m.llm.attempts });
  for (const [name, n] of Object.entries(m.calls ?? {})) {
    const service = name.toLowerCase() as Service;
    if (!['tavily', 'fred', 'tiingo', 'eia'].includes(service) || !n) continue;
    rows.push({ ...base, service, key_fingerprint: fp(service), calls: n, credits: service === 'tavily' ? (m.credits ?? 0) : 0 });
  }
  return rows;
}

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
  // Per-stage provider request counts (D-059): discard anything counted before this stage.
  for (const d of deps.data) d.takeRequestStats?.();
  const t0 = Date.now();
  const recordMetrics = () => {
    metrics.ms = Date.now() - t0;
    const requests: Record<string, Record<string, number>> = {};
    for (const d of deps.data) {
      const s = d.takeRequestStats?.();
      if (s && Object.keys(s).length) requests[d.id] = s;
    }
    if (Object.keys(requests).length) {
      metrics.requests = requests;
      console.info(`[provider] ${JSON.stringify({ job: job.id, stage, attempt, ms: metrics.ms, requests })}`);
    }
    const all = { ...(job.metrics.stages ?? {}) };
    all[stage] = [...(all[stage] ?? []), metrics];
    return { ...job.metrics, startedAt: job.metrics.startedAt ?? new Date(t0).toISOString(), stages: all };
  };

  try {
    const output = await STAGE_IMPL[stage](ctx);
    const m = recordMetrics();
    await deps.store.finishRun(runId, 'succeeded', output, null, metrics);
    await deps.store.recordUsage(usageRows(deps, job, stage, metrics)).catch(() => undefined);
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
    if (e instanceof LlmError) metrics.llm = { ...e.usage, attempts: 2, ...(e.model ? { model: e.model } : {}) };
    const m = recordMetrics();
    await deps.store.finishRun(runId, 'failed', null, message.slice(0, 2000), metrics);
    await deps.store.recordUsage(usageRows(deps, job, stage, metrics)).catch(() => undefined);
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
  const perStage: Record<string, { ms: number; runs: number; tokens: number; model?: string }> = {};
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
      if (r.llm?.model) p.model = r.llm.model;
    }
  }
  return { ms, promptTokens: prompt, completionTokens: completion, llmCalls, searchCredits: credits, calls, perStage };
}
