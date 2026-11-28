'use client';

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { publicationPreflight, publishArticle, setFeaturedArticle, unpublishArticle, type Preflight } from '@/app/admin/publish-actions';
import { fixPublicationIssues } from '@/app/admin/fix-actions';
import { issueKey, MAX_FIX_ATTEMPTS, type FixChange, type FixRejected, type ClearedReason, type ManualIssue } from '@/lib/editorial/fix';
import type { SeshatArticle, ValidationIssue } from '@/lib/studio/schema';
import { STATE_LABELS, slugProblem, type PublicationState } from '@/lib/publishing/rules';

export type PublicationView = {
  state: PublicationState;
  slug: string | null;
  publishedRevision: number;
  sourceRevision: number | null;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  unpublishedAt: string | null;
  /** Phase 3C: place on the homepage while live — explicitly featured, default lead (newest, nothing featured) or neither. */
  homepage?: 'featured' | 'lead' | 'none';
};

const STATE_STYLE: Record<PublicationState, string> = {
  never: 'bg-cream-200 text-ink-soft',
  live: 'bg-[#e3f1ec] text-ev-documented',
  live_changed: 'bg-[#fff4ec] text-[#9a3412]',
  unpublished: 'bg-[#eceff5] text-navy-800',
};

export function PublicationBadge({ state }: { state: PublicationState }) {
  if (state === 'never') return null;
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[state]}`}>{STATE_LABELS[state]}</span>;
}

const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '—');

type Mode = 'publish' | 'unpublish' | null;
const noSubscribe = () => () => {};

/** A Fix It for Me attempt saved a new revision: the workspace adopts it without reloading (the dialog stays open). */
export type Repaired = { revision: number; status: string; issues: ValidationIssue[]; content: SeshatArticle };

export function PublishPanel({ articleId, revision, dirty, generating, pub, onRepaired }: { articleId: string; revision: number; dirty: boolean; generating: boolean; pub: PublicationView; onRepaired?: (r: Repaired) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => '');

  const url = pub.slug ? `${origin}/story/${pub.slug}` : null;
  const lockReason = generating ? 'Generation is running.' : dirty ? 'Save your changes first — publishing uses the latest saved revision.' : null;
  const canRepublish = pub.state !== 'live';

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setFlash({ kind: 'error', text: 'Could not copy — select the address and copy it manually.' });
    }
  };

  return (
    <section aria-label="Publication" className="studio-card mt-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Publication</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[pub.state]}`}>{STATE_LABELS[pub.state]}</span>
        {pub.publishedRevision > 0 ? (
          <span className="text-xs text-ink-soft">
            Publication {pub.publishedRevision} (from draft rev {pub.sourceRevision}) · first published {when(pub.firstPublishedAt)} · latest {when(pub.lastPublishedAt)}
            {pub.state === 'unpublished' ? ` · unpublished ${when(pub.unpublishedAt)}` : ''}
          </span>
        ) : (
          <span className="text-xs text-ink-soft">This draft has never been published.</span>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {pub.state === 'live' || pub.state === 'live_changed' ? (
            <button type="button" className="studio-btn" onClick={() => (setFlash(null), setMode('unpublish'))}>
              Unpublish…
            </button>
          ) : null}
          <button
            type="button"
            className="studio-btn-primary"
            disabled={!!lockReason || !canRepublish}
            title={lockReason ?? (canRepublish ? undefined : 'The live publication already matches this revision.')}
            onClick={() => (setFlash(null), setMode('publish'))}
          >
            {pub.state === 'never' ? 'Publish…' : pub.state === 'live' ? 'Up to date' : 'Republish…'}
          </button>
        </span>
      </div>
      {pub.state === 'live_changed' ? (
        <p className="mt-2 text-sm text-[#9a3412]">
          The working draft (rev {revision}) has changes that are not published. Readers see publication {pub.publishedRevision} (draft rev {pub.sourceRevision}) until you republish.
        </p>
      ) : null}
      {pub.slug ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold text-muted">Public URL</span>
          <code className="rounded bg-cream-100 px-2 py-0.5 text-xs text-ink">{url ?? `/story/${pub.slug}`}</code>
          <button type="button" className="studio-btn-quiet" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {pub.state === 'live' || pub.state === 'live_changed' ? (
            <a className="studio-btn-quiet" href={`/story/${pub.slug}`} target="_blank" rel="noopener noreferrer">
              View published article
            </a>
          ) : (
            <span className="text-xs text-muted">
              Permanent address{pub.state === 'unpublished' ? ' · currently unpublished, so readers get “page not found” until you republish' : ''}.
            </span>
          )}
          {pub.state === 'live_changed' ? <span className="text-xs text-muted">Readers see publication {pub.publishedRevision}, not your latest edits.</span> : null}
        </div>
      ) : null}
      {pub.state === 'live' || pub.state === 'live_changed' ? <HomepageFeature articleId={articleId} role={pub.homepage ?? 'none'} onResult={setFlash} /> : null}
      {lockReason && pub.state !== 'live' ? <p className="mt-2 text-xs text-muted">{lockReason}</p> : null}
      {flash ? (
        <p role="status" className={`mt-2 text-sm ${flash.kind === 'ok' ? 'text-ev-documented' : 'text-[#9a3412]'}`}>
          {flash.text}
        </p>
      ) : null}

      {mode === 'publish' ? <PublishDialog articleId={articleId} expectedRevision={revision} onRepaired={onRepaired} onClose={(m) => (setMode(null), m && setFlash(m))} /> : null}
      {mode === 'unpublish' ? <UnpublishDialog articleId={articleId} pub={pub} onClose={(m) => (setMode(null), m && setFlash(m))} /> : null}
    </section>
  );
}

type Done = (msg?: { kind: 'ok' | 'error'; text: string }) => void;

export function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/40 px-4 py-10" onClick={() => !busy && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-2xl rounded-2xl border border-cream-300 bg-cream-50 p-6 shadow-xl outline-none" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-semibold text-navy-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function IssueList({ title, items, tone, children }: { title: string; items: { message: string; section?: string }[]; tone: 'error' | 'warning'; children?: React.ReactNode }) {
  const [all, setAll] = useState(false);
  if (!items.length) return children ? <div className="mt-4">{children}</div> : null;
  const shown = all ? items : items.slice(0, 8);
  return (
    <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${tone === 'error' ? 'border-[#9f1239]/30 bg-[#fbe9e7]' : 'border-[#c2410c]/30 bg-[#fff4ec]'}`}>
      <p className={`font-semibold ${tone === 'error' ? 'text-[#9f1239]' : 'text-[#9a3412]'}`}>
        {title} ({items.length})
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
        {shown.map((i, n) => (
          <li key={n}>
            {i.section ? <span className="text-xs font-semibold text-muted">{i.section} · </span> : null}
            {i.message}
          </li>
        ))}
      </ul>
      {items.length > shown.length ? (
        <button type="button" className="mt-1 text-xs font-semibold text-navy-700 underline" onClick={() => setAll(true)}>
          Show all {items.length}
        </button>
      ) : null}
      {children}
    </div>
  );
}

/** Accumulated outcome of one Fix It for Me run (up to MAX_FIX_ATTEMPTS attempts). */
type FixRun = {
  running: boolean;
  progress: string;
  attempts: number;
  initial: number;
  resolved: number;
  revisions: number[];
  changes: FixChange[];
  rejected: FixRejected[];
  cleared: ClearedReason[];
  manual: ManualIssue[];
  stopped?: string;
  error?: string;
};

function PublishDialog({ articleId, expectedRevision, onClose, onRepaired }: { articleId: string; expectedRevision: number; onClose: Done; onRepaired?: (r: Repaired) => void }) {
  const [pre, setPre] = useState<Preflight | null>(null);
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submitted = useRef(false);
  const [fix, setFix] = useState<FixRun | null>(null);
  const fixing = useRef(false);
  const router = useRouter();
  const close: Done = (m) => {
    // Fix It saved without reloading the page; refresh once so History and the server view catch up.
    if (fix?.revisions.length) router.refresh();
    onClose(m);
  };

  const runFix = async () => {
    const start0 = pre?.ok ? pre : null;
    if (!start0 || fixing.current) return; // one run at a time; guards double-clicks
    fixing.current = true;
    setError(null);
    const initial = start0.blocking;
    const run: FixRun = { running: true, progress: '', attempts: 0, initial: initial.length, resolved: 0, revisions: [], changes: [], rejected: [], cleared: [], manual: [] };
    const show = (patch: Partial<FixRun>) => setFix({ ...Object.assign(run, patch) });
    let rev = start0.revision;
    let remaining = initial;
    try {
      for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
        show({ progress: `Attempt ${attempt} of ${MAX_FIX_ATTEMPTS}: repairing ${remaining.length} blocking issue(s)… this usually takes 15–60 seconds.` });
        const r = await fixPublicationIssues({ articleId, expectedRevision: rev, attempt, feedback: run.rejected.map((x) => ({ path: x.path, why: x.why })) });
        if (!r.ok) {
          show({ error: r.error });
          break;
        }
        run.attempts = attempt;
        for (const c of r.changes) {
          const i = run.changes.findIndex((x) => x.path === c.path);
          if (i >= 0) run.changes[i] = { ...c, before: run.changes[i].before, notes: [...new Set([...run.changes[i].notes, ...c.notes])] };
          else run.changes.push(c);
        }
        run.rejected = r.rejected;
        run.cleared.push(...r.cleared);
        run.manual = r.manual;
        remaining = r.blocking;
        if (r.changed) {
          rev = r.revision;
          run.revisions.push(r.revision);
          onRepaired?.({ revision: r.revision, status: r.status, issues: r.issues, content: r.content });
        }
        if (!r.blocking.length) break;
        if (!r.retry) {
          run.stopped = !r.changed && !r.rejected.length
            ? r.manual.length && !r.changes.length
              ? 'Nothing left can be repaired automatically: see “Needs you” below.'
              : 'No rewrite passed the checks, so nothing was changed in this attempt.'
            : attempt >= MAX_FIX_ATTEMPTS
              ? `Stopped after the maximum of ${MAX_FIX_ATTEMPTS} attempts.`
              : 'Stopped: the remaining issues cannot be repaired automatically, or the last attempt made no progress.';
          break;
        }
      }
    } catch {
      show({ error: 'Fix It for Me could not reach the server. The draft is unchanged unless a revision is listed below.' });
    }
    const left = new Set(remaining.map(issueKey));
    show({ running: false, progress: '', resolved: initial.filter((i) => !left.has(issueKey(i))).length });
    // Re-run publication validation on the saved revision and refresh the dialog.
    try {
      const p = await publicationPreflight(articleId);
      setPre(p);
    } catch {
      setPre({ ok: false, error: 'Could not re-run the publication checks. Close and reopen the dialog.' });
    }
    fixing.current = false;
  };

  useEffect(() => {
    let live = true;
    publicationPreflight(articleId).then(
      (p) => {
        if (!live) return;
        setPre(p);
        if (p.ok) setSlug(p.slug);
      },
      () => live && setPre({ ok: false, error: 'Could not run the publication checks. Try again.' }),
    );
    return () => {
      live = false;
    };
  }, [articleId]);

  const ready = pre?.ok ? pre : null;
  // While Fix It runs, the workspace adopts each new revision before the checks are re-run: not a stale view.
  const stale = !!ready && ready.revision !== expectedRevision && !fix?.running;
  const slugErr = ready && !ready.slugLocked ? slugProblem(slug) : null;
  const first = ready?.state === 'never';
  const verb = first ? 'Publish' : 'Republish';

  const confirm = () => {
    if (!ready || stale || submitted.current) return; // guards double-clicks before the transition starts
    submitted.current = true;
    start(async () => {
      const r = await publishArticle({ articleId, expectedRevision, slug: ready.slugLocked ? undefined : slug, note });
      if (r.ok) {
        close({ kind: 'ok', text: r.outcome === 'unchanged' ? `Already live: publication ${r.publication} (draft rev ${r.sourceRevision}).` : `Published as publication ${r.publication} (draft rev ${r.sourceRevision}) at /story/${r.slug}.` });
      } else {
        submitted.current = false;
        setError(r.error);
        if (r.blocking) setPre({ ...ready, canPublish: false, blocking: r.blocking });
      }
    });
  };

  return (
    <Modal title={`${verb} this story?`} onClose={() => close()} busy={busy || !!fix?.running}>
      {!pre ? <p className="mt-4 text-sm text-muted">Running publication checks…</p> : null}
      {pre && !pre.ok ? <p className="mt-4 text-sm text-[#9a3412]">{pre.error}</p> : null}
      {ready ? (
        <>
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold text-ink">Headline</dt>
            <dd className="text-ink-soft">{ready.headline || '—'}</dd>
            <dt className="font-semibold text-ink">Version</dt>
            <dd className="text-ink-soft">
              Draft revision <strong className="text-ink">{ready.revision}</strong> becomes publication <strong className="text-ink">{ready.nextPublication}</strong>
              {first ? '' : '; the current live publication is kept in the history'}.
            </dd>
            <dt className="font-semibold text-ink">URL</dt>
            <dd>
              {ready.slugLocked ? (
                <code className="text-xs">/story/{ready.slug}</code>
              ) : (
                <>
                  <span className="flex items-center gap-1 text-xs">
                    <code>/story/</code>
                    <input className="studio-input py-1 text-xs" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label="URL slug" maxLength={80} disabled={busy} />
                  </span>
                  <span className={`mt-1 block text-xs ${slugErr ? 'text-[#9a3412]' : 'text-muted'}`}>{slugErr ?? 'Permanent: the slug cannot change after the first publication.'}</span>
                </>
              )}
            </dd>
          </dl>
          {stale ? <p className="mt-4 text-sm text-[#9a3412]">The draft changed since this page loaded: it is now revision {ready.revision}, but you are looking at revision {expectedRevision}. Reload the page and review the latest revision before publishing.</p> : null}
          <IssueList title="Blocking issues — fix before publishing" items={ready.blocking} tone="error">
            {fixable(ready.blocking) || fix ? <FixItPanel run={fix} canRun={fixable(ready.blocking) && !stale && !busy && !fix?.running} onRun={runFix} /> : null}
          </IssueList>
          <IssueList title="Editorial warnings — review, not blocking" items={ready.warnings} tone="warning" />
          {ready.canPublish ? (
            <label className="mt-4 block text-sm">
              <span className="studio-label">Publication note (optional, kept in the history)</span>
              <input className="studio-input mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={first ? 'e.g. First edition' : 'e.g. Corrected the inflation figure in Macro'} disabled={busy} />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-[#9a3412]">
              {error}
            </p>
          ) : null}
          <p className="mt-4 text-xs text-muted">Publishing stores a snapshot of this revision. Later edits or regeneration never change it until you republish.</p>
        </>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="studio-btn" onClick={() => close()} disabled={busy || !!fix?.running}>
          {fix?.revisions.length ? 'Close' : 'Cancel'}
        </button>
        <button type="button" className="studio-btn-primary" onClick={confirm} disabled={!ready?.canPublish || stale || !!slugErr || busy || !!fix?.running}>
          {busy ? `${verb === 'Publish' ? 'Publishing' : 'Republishing'}…` : ready ? `${verb} revision ${ready.revision}` : verb}
        </button>
      </div>
    </Modal>
  );
}

/** Blocking issues Fix It can never change (draft properties or a running job). */
const NOT_CONTENT = new Set(['temporary-draft', 'generation-running', 'no-content']);
const fixable = (blocking: { code: string }[]) => blocking.some((i) => !NOT_CONTENT.has(i.code));

function FixItPanel({ run, canRun, onRun }: { run: FixRun | null; canRun: boolean; onRun: () => void }) {
  return (
    <div className="mt-3 border-t border-[#9f1239]/20 pt-3">
      {!run || (!run.running && run.attempts === 0 && !run.error) ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="studio-btn-primary" onClick={onRun} disabled={!canRun}>
            Fix It for Me
          </button>
          <span className="text-xs text-ink-soft">
            Rewrites only the passages behind these issues (up to {MAX_FIX_ATTEMPTS} attempts) and saves a new draft revision. The current revision stays in History. Nothing is published.
          </span>
        </div>
      ) : null}
      {run?.running ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ink">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-navy-700 border-t-transparent" aria-hidden="true" />
          {run.progress}
        </p>
      ) : null}
      {run && !run.running && (run.attempts > 0 || run.error) ? <FixSummary run={run} canRun={canRun} onRun={onRun} /> : null}
    </div>
  );
}

function FixSummary({ run, canRun, onRun }: { run: FixRun; canRun: boolean; onRun: () => void }) {
  const remaining = run.initial - run.resolved;
  return (
    <div className="space-y-2 text-sm text-ink-soft" role="status" aria-live="polite">
      <p className="font-semibold text-ink">
        Fix It for Me: resolved {run.resolved} of {run.initial} blocking issue(s) in {run.attempts} attempt(s).
        {run.revisions.length ? ` Saved as revision ${run.revisions.join(', ')}; the previous text is kept in History.` : ' No revision was saved.'}
      </p>
      {run.error ? <p className="text-[#9a3412]">{run.error}</p> : null}
      {run.stopped && remaining > 0 ? <p>{run.stopped}</p> : null}
      {run.changes.length ? (
        <details open={run.changes.some((c) => c.notes.length > 0)}>
          <summary className="cursor-pointer font-semibold text-ink">Changed {run.changes.length} field(s)</summary>
          <ul className="mt-1 space-y-2">
            {run.changes.map((c) => (
              <li key={c.path} className="rounded border border-cream-300 bg-cream-50 p-2">
                <span className="text-xs font-semibold text-muted">{c.label}</span>
                <p className="mt-1 text-xs line-through decoration-[#9f1239]/50">{c.before}</p>
                <p className="mt-1 text-xs text-ink">{c.after}</p>
                {c.notes.map((n, i) => (
                  <p key={i} className="mt-1 text-xs font-semibold text-[#9a3412]">
                    {n}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {run.cleared.length ? <p className="text-xs">Cleared {run.cleared.length} attention note(s) the validator no longer reports ({[...new Set(run.cleared.map((c) => c.section))].join(', ')}).</p> : null}
      {run.rejected.length ? (
        <div className="text-xs">
          <p className="font-semibold text-ink">Rewrites discarded by the safety checks (original text kept):</p>
          <ul className="list-disc pl-5">
            {run.rejected.map((r, i) => (
              <li key={i}>
                {r.label}: {r.why}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {run.manual.length ? (
        <div className="text-xs">
          <p className="font-semibold text-ink">Needs you (not repaired automatically):</p>
          <ul className="list-disc pl-5">
            {run.manual.map((m, i) => (
              <li key={i}>
                {m.section ? <span className="font-semibold text-muted">{m.section} · </span> : null}
                {m.message.slice(0, 200)} — {m.why}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {remaining > 0 ? (
        <p className="text-xs">
          The remaining issues are listed above. Correct them in the section tabs{canRun ? ', or ' : '.'}
          {canRun ? (
            <button type="button" className="font-semibold text-navy-700 underline" onClick={onRun}>
              run Fix It for Me again
            </button>
          ) : null}
          {canRun ? '.' : null}
        </p>
      ) : null}
    </div>
  );
}

function UnpublishDialog({ articleId, pub, onClose }: { articleId: string; pub: PublicationView; onClose: Done }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submitted = useRef(false);
  const confirm = () => {
    if (submitted.current) return;
    submitted.current = true;
    start(async () => {
      const r = await unpublishArticle(articleId);
      if (r.ok) onClose({ kind: 'ok', text: r.outcome === 'unchanged' ? 'This story was already unpublished.' : 'Unpublished. The draft, its URL slug and the publication history are kept.' });
      else {
        submitted.current = false;
        setError(r.error);
      }
    });
  };
  return (
    <Modal title="Unpublish this story?" onClose={() => onClose()} busy={busy}>
      <p className="mt-4 text-sm text-ink-soft">
        Publication {pub.publishedRevision} at <code className="text-xs">/story/{pub.slug}</code> will no longer be publicly available. The working draft, the permanent slug and every published revision are kept, and you can republish later under the same address.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-[#9a3412]">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="studio-btn" onClick={() => onClose()} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="studio-btn-primary" onClick={confirm} disabled={busy}>
          {busy ? 'Unpublishing…' : 'Unpublish'}
        </button>
      </div>
    </Modal>
  );
}

const HOMEPAGE_TEXT: Record<'featured' | 'lead' | 'none', string> = {
  featured: 'Featured on the homepage.',
  lead: 'Leads the homepage as the newest story (nothing is featured).',
  none: 'Listed under Latest stories on the homepage.',
};

/** Phase 3C: choose this live article as the homepage feature, or clear the choice. */
function HomepageFeature({ articleId, role, onResult }: { articleId: string; role: 'featured' | 'lead' | 'none'; onResult: (m: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [pending, start] = useTransition();
  const run = (id: string | null) =>
    start(async () => {
      const r = await setFeaturedArticle(id);
      if (!r.ok) return onResult({ kind: 'error', text: r.error });
      onResult({
        kind: 'ok',
        text: r.outcome === 'cleared' ? 'Feature removed. The homepage now leads with the newest story.' : r.outcome === 'featured' ? 'Featured on the homepage.' : 'No change.',
      });
    });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs font-semibold text-muted">Homepage</span>
      <span className="text-xs text-ink-soft">{HOMEPAGE_TEXT[role]}</span>
      {role === 'featured' ? (
        <button type="button" className="studio-btn-quiet" disabled={pending} onClick={() => run(null)}>
          {pending ? 'Updating…' : 'Remove feature'}
        </button>
      ) : (
        <button type="button" className="studio-btn-quiet" disabled={pending} onClick={() => run(articleId)} title="Only one article is featured at a time; this replaces any current choice.">
          {pending ? 'Updating…' : 'Feature on homepage'}
        </button>
      )}
    </div>
  );
}
