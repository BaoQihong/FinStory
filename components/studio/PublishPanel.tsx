'use client';

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { publicationPreflight, publishArticle, unpublishArticle, type Preflight } from '@/app/admin/publish-actions';
import { STATE_LABELS, slugProblem, type PublicationState } from '@/lib/publishing/rules';

export type PublicationView = {
  state: PublicationState;
  slug: string | null;
  publishedRevision: number;
  sourceRevision: number | null;
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  unpublishedAt: string | null;
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

export function PublishPanel({ articleId, revision, dirty, generating, pub }: { articleId: string; revision: number; dirty: boolean; generating: boolean; pub: PublicationView }) {
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
      {lockReason && pub.state !== 'live' ? <p className="mt-2 text-xs text-muted">{lockReason}</p> : null}
      {flash ? (
        <p role="status" className={`mt-2 text-sm ${flash.kind === 'ok' ? 'text-ev-documented' : 'text-[#9a3412]'}`}>
          {flash.text}
        </p>
      ) : null}

      {mode === 'publish' ? <PublishDialog articleId={articleId} expectedRevision={revision} onClose={(m) => (setMode(null), m && setFlash(m))} /> : null}
      {mode === 'unpublish' ? <UnpublishDialog articleId={articleId} pub={pub} onClose={(m) => (setMode(null), m && setFlash(m))} /> : null}
    </section>
  );
}

type Done = (msg?: { kind: 'ok' | 'error'; text: string }) => void;

function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
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

function IssueList({ title, items, tone }: { title: string; items: { message: string; section?: string }[]; tone: 'error' | 'warning' }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
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
    </div>
  );
}

function PublishDialog({ articleId, expectedRevision, onClose }: { articleId: string; expectedRevision: number; onClose: Done }) {
  const [pre, setPre] = useState<Preflight | null>(null);
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submitted = useRef(false);

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
  const stale = !!ready && ready.revision !== expectedRevision;
  const slugErr = ready && !ready.slugLocked ? slugProblem(slug) : null;
  const first = ready?.state === 'never';
  const verb = first ? 'Publish' : 'Republish';

  const confirm = () => {
    if (!ready || stale || submitted.current) return; // guards double-clicks before the transition starts
    submitted.current = true;
    start(async () => {
      const r = await publishArticle({ articleId, expectedRevision, slug: ready.slugLocked ? undefined : slug, note });
      if (r.ok) {
        onClose({ kind: 'ok', text: r.outcome === 'unchanged' ? `Already live: publication ${r.publication} (draft rev ${r.sourceRevision}).` : `Published as publication ${r.publication} (draft rev ${r.sourceRevision}) at /story/${r.slug}.` });
      } else {
        submitted.current = false;
        setError(r.error);
        if (r.blocking) setPre({ ...ready, canPublish: false, blocking: r.blocking });
      }
    });
  };

  return (
    <Modal title={`${verb} this story?`} onClose={() => onClose()} busy={busy}>
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
          <IssueList title="Blocking issues — fix before publishing" items={ready.blocking} tone="error" />
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
        <button type="button" className="studio-btn" onClick={() => onClose()} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="studio-btn-primary" onClick={confirm} disabled={!ready?.canPublish || stale || !!slugErr || busy}>
          {busy ? `${verb === 'Publish' ? 'Publishing' : 'Republishing'}…` : ready ? `${verb} revision ${ready.revision}` : verb}
        </button>
      </div>
    </Modal>
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
