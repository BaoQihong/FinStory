'use client';
// "Delete draft" at the foot of the draft page (D-062). Only never-published
// drafts can be deleted; for anything ever published the panel explains why
// not instead of offering a button that would fail.

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDraft } from '@/app/admin/delete-actions';
import { canDeleteDraft } from '@/lib/studio/delete-rules';
import { Modal } from './PublishPanel';

export function DeleteDraftPanel(props: { articleId: string; title: string; temporary?: boolean; firstPublishedAt: string | null; isLive: boolean; generating: boolean; dirty: boolean; revisions: number; hasResearch: boolean }) {
  const check = canDeleteDraft({ firstPublishedAt: props.firstPublishedAt, isLive: props.isLive, generating: props.generating });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await deleteDraft({ articleId: props.articleId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/admin?deleted=${encodeURIComponent(r.title.slice(0, 120))}`);
      router.refresh();
    });

  return (
    <section aria-labelledby="delete-draft-heading" className="mt-12 border-t border-cream-300 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id="delete-draft-heading" className="text-sm font-semibold text-ink">
            Delete draft
          </h2>
          {check.ok ? (
            <p className="mt-1 text-sm text-muted">Permanently removes this draft and its research. Use it for test drafts, failed generations and ideas you have dropped. This cannot be undone.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">{check.reason}</p>
          )}
        </div>
        {check.ok || check.kind === 'busy' ? (
          <button type="button" className="studio-btn-danger-outline" disabled={!check.ok} onClick={() => (setError(null), setOpen(true))}>
            Delete draft…
          </button>
        ) : null}
      </div>
      {open ? (
        <Modal title="Delete this draft?" busy={busy} onClose={() => setOpen(false)}>
          <ConfirmBody {...props} busy={busy} error={error} onCancel={() => setOpen(false)} onConfirm={confirm} />
        </Modal>
      ) : null}
    </section>
  );
}

function ConfirmBody(p: { title: string; temporary?: boolean; dirty: boolean; revisions: number; hasResearch: boolean; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The dialog focuses itself on open; move focus to Cancel right after, so Enter never deletes by accident.
  useEffect(() => {
    const t = setTimeout(() => cancelRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mt-3 text-sm text-ink-soft">
      <p className="font-display text-lg text-navy-900">
        {p.temporary ? <span className="mr-2 rounded-full bg-cream-200 px-2 py-0.5 align-middle font-sans text-xs font-semibold text-ink-soft">Temporary</span> : null}“{p.title}”
      </p>
      <p className="mt-3">This permanently deletes:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <li>
          the draft and its {p.revisions === 1 ? 'one saved revision' : `${p.revisions} saved revisions`}
        </li>
        {p.hasResearch ? <li>its generation record, research sources, findings and datasets</li> : null}
      </ul>
      <p className="mt-3">AI usage records are kept, and appear as “Deleted draft” in Usage. It has never been published, so no reader or public link is affected.</p>
      {p.dirty ? <p className="mt-3 font-semibold text-[#9a3412]">You also have unsaved changes on this page; they will be lost.</p> : null}
      <p className="mt-3 font-semibold text-ink">This cannot be undone.</p>
      {p.error ? (
        <p role="alert" className="mt-4 text-[#9a3412]">
          {p.error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} type="button" className="studio-btn" disabled={p.busy} onClick={p.onCancel}>
          Cancel
        </button>
        <button type="button" className="studio-btn-danger" disabled={p.busy} onClick={p.onConfirm}>
          {p.busy ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </div>
  );
}
