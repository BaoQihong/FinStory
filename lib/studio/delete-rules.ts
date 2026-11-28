// Draft deletion rule (D-062), shared by the studio UI and the server action.
// Only drafts that have NEVER been published can be deleted: a published
// article's permanent URL and publication history are kept (the database
// enforces this too: publication_revisions → articles is ON DELETE RESTRICT).
// Unpublishing is how a live article is taken away from readers.

export type DeleteCheck = { ok: true } | { ok: false; reason: string; kind: 'published' | 'busy' };

export function canDeleteDraft(a: { firstPublishedAt: string | null; isLive: boolean; generating: boolean; aiBusy?: boolean }): DeleteCheck {
  if (a.isLive || a.firstPublishedAt)
    return {
      ok: false,
      kind: 'published',
      reason: a.isLive
        ? 'This article is live. Published articles cannot be deleted: their permanent URL and publication history are kept. Unpublish it to take it away from readers.'
        : 'This article was published before. Its permanent URL and publication history are kept, so it cannot be deleted; it stays unpublished and invisible to readers.',
    };
  if (a.generating) return { ok: false, kind: 'busy', reason: 'A story is being generated for this draft. Wait for it to finish, then delete.' };
  if (a.aiBusy) return { ok: false, kind: 'busy', reason: 'Editorial Polish or Fix It for Me is working on this draft. Try again when it has finished.' };
  return { ok: true };
}
