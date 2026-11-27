'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelJob, retryJob } from '@/app/admin/actions';
import type { JobView } from '@/lib/studio/job-view';
import { PROGRESS_STEPS, STAGES } from '@/lib/studio/pipeline/types';

const fmtMs = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);

export function GenerationPanel({ initial }: { initial: JobView }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [netError, setNetError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const active = job.status === 'queued' || job.status === 'running';

  // Drive the job: one stage per request, until it finishes or fails. Stops if the tab closes;
  // reopening the draft resumes from the next unfinished stage.
  useEffect(() => {
    if (!active || running.current) return;
    running.current = true;
    let stop = false;
    (async () => {
      let lastStatus = job.status;
      while (!stop) {
        try {
          const res = await fetch(`/api/studio/jobs/${job.id}/step`, { method: 'POST' });
          const body = await res.json();
          if (!res.ok) {
            setNetError(body.error ?? `HTTP ${res.status}`);
            await new Promise((r) => setTimeout(r, 5000));
            if (res.status === 401 || res.status === 503) break;
            continue;
          }
          setNetError('');
          if (body.job) {
            setJob(body.job);
            lastStatus = body.job.status;
          }
          if (body.kind === 'busy') await new Promise((r) => setTimeout(r, 4000));
          if (body.kind === 'idle' || !['queued', 'running'].includes(lastStatus)) break;
        } catch (e) {
          setNetError(`Connection problem (${(e as Error).message}); retrying…`);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      running.current = false;
      if (!stop) router.refresh();
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, job.id]);

  const stageIndex = job.stage === 'done' ? STAGES.length : STAGES.indexOf(job.stage);
  const stepState = (stages: readonly string[]) => {
    if (stages.includes('done')) return job.status === 'succeeded' ? 'done' : 'pending';
    const idx = stages.map((s) => STAGES.indexOf(s as (typeof STAGES)[number]));
    if (Math.max(...idx) < stageIndex) return 'done';
    if (idx.includes(stageIndex) || (Math.min(...idx) <= stageIndex && stageIndex <= Math.max(...idx))) return job.status === 'failed' ? 'failed' : active ? 'current' : 'pending';
    return 'pending';
  };
  const elapsed = job.metrics.startedAt ? (job.metrics.finishedAt ? Date.parse(job.metrics.finishedAt) : (now ?? Date.parse(job.metrics.startedAt))) - Date.parse(job.metrics.startedAt) : 0;

  return (
    <section aria-labelledby="gen-title" className="studio-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="gen-title" className="font-display text-xl font-semibold text-navy-900">
          {active ? 'Researching and drafting…' : job.status === 'succeeded' ? 'Ready for editorial review' : job.status === 'failed' ? 'Generation stopped' : 'Generation cancelled'}
        </h2>
        {elapsed ? <span className="text-xs text-muted">{fmtMs(elapsed)}</span> : null}
        <div className="ml-auto flex gap-2">
          {job.status === 'failed' ? (
            <button
              type="button"
              className="studio-btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await retryJob(job.id);
                setBusy(false);
                if (!r.ok) setNetError(r.error ?? 'Retry failed');
                else setJob({ ...job, status: 'running', error: null });
              }}
            >
              Retry from “{job.error?.stage}”
            </button>
          ) : null}
          {active ? (
            <button
              type="button"
              className="studio-btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await cancelJob(job.id);
                setBusy(false);
                setJob({ ...job, status: 'cancelled' });
                router.refresh();
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PROGRESS_STEPS.map((p, i) => {
          const st = stepState(p.stages);
          return (
            <li
              key={p.label}
              aria-current={st === 'current' ? 'step' : undefined}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                st === 'done' ? 'border-ev-documented/30 bg-[#e3f1ec] text-ev-documented' : st === 'current' ? 'border-gold-500 bg-[#fbf1dc] text-ink' : st === 'failed' ? 'border-[#9f1239]/30 bg-[#fbe9e7] text-[#9f1239]' : 'border-cream-300 text-muted'
              }`}
            >
              <span aria-hidden="true" className="w-4 text-center font-semibold">
                {st === 'done' ? '✓' : st === 'current' ? <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gold-500" /> : st === 'failed' ? '!' : i + 1}
              </span>
              {p.label}
            </li>
          );
        })}
      </ol>

      {job.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-[#9f1239]/30 bg-[#fbe9e7] px-3 py-2 text-sm text-ink">
          <strong className="font-semibold">Stage “{job.error.stage}”{job.error.retryable && active ? ' (retrying automatically)' : ''}:</strong> {job.error.message}
        </p>
      ) : null}
      {netError ? <p className="mt-3 text-sm text-[#9a3412]">{netError}</p> : null}

      {job.warnings.length ? (
        <details className="group mt-4" open={!active && job.status !== 'succeeded'}>
          <summary className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
            {job.warnings.length} research warning{job.warnings.length === 1 ? '' : 's'} and limitations
            <svg viewBox="0 0 12 12" className="chev h-3 w-3 transition-transform" aria-hidden="true">
              <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </summary>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs leading-relaxed text-ink-soft">
            {job.warnings.map((w, i) => (
              <li key={i}>
                <span className="font-semibold text-muted">[{w.stage}]</span> {w.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!active ? (
        <p className="mt-4 text-xs text-muted">
          {job.metrics.llmCalls} model calls · {(job.metrics.promptTokens + job.metrics.completionTokens).toLocaleString('en-US')} tokens ({job.metrics.promptTokens.toLocaleString('en-US')} in /{' '}
          {job.metrics.completionTokens.toLocaleString('en-US')} out) · {job.metrics.searchCredits} search credits · data calls{' '}
          {Object.entries(job.metrics.calls)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ') || '0'}
        </p>
      ) : null}
    </section>
  );
}
