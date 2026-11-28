// Core of "Delete draft" (D-062), independent of Next.js so it can be unit
// tested with a fake client. The server action (app/admin/delete-actions.ts)
// authenticates the editor and calls this with the editor's RLS-bound client.
//
// The delete is filtered on "never published and not live", so a draft that
// was published between the check and the delete is never removed. The
// database's ON DELETE RESTRICT on publication history is the final guard.
// Revisions, jobs, sources, findings and datasets cascade; api_usage rows are
// kept (article_id set to null).
import { canDeleteDraft } from './delete-rules.ts';

export const AI_IN_FLIGHT_MS = 300_000; // same window as Polish / Fix It reservations

export type DeleteResult = { ok: true; title: string } | { ok: false; error: string };

type Res<T> = PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>;
/** The slice of the Supabase query builder this needs (structural, so tests can fake it). */
export type DeleteDb = {
  from(table: string): {
    select(cols: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any -- chain shape differs per query
    delete(): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
};

export async function deleteDraftCore(db: DeleteDb, articleId: string, now: () => number = Date.now): Promise<DeleteResult> {
  if (!/^[0-9a-f-]{36}$/.test(String(articleId ?? ''))) return { ok: false, error: 'Invalid request.' };

  const { data: a } = await (db.from('articles').select('id, working_title, is_live, first_published_at').eq('id', articleId).maybeSingle() as Res<{ id: string; working_title: string; is_live: boolean; first_published_at: string | null }>);
  if (!a) return { ok: false, error: 'This draft no longer exists — it may already have been deleted.' };
  const [{ data: jobs }, { data: slots }] = await Promise.all([
    db.from('generation_jobs').select('id').eq('article_id', articleId).in('status', ['queued', 'running']).limit(1) as Res<{ id: string }[]>,
    db.from('api_usage').select('id').eq('article_id', articleId).in('stage', ['polish', 'fix']).eq('calls', 0).gte('created_at', new Date(now() - AI_IN_FLIGHT_MS).toISOString()).limit(1) as Res<{ id: number }[]>,
  ]);
  const check = canDeleteDraft({ firstPublishedAt: a.first_published_at, isLive: a.is_live, generating: !!jobs?.length, aiBusy: !!slots?.length });
  if (!check.ok) return { ok: false, error: check.reason };

  const { data: gone, error } = await (db.from('articles').delete().eq('id', articleId).is('first_published_at', null).eq('is_live', false).select('id') as Res<{ id: string }[]>);
  if (error) {
    // 23503 = foreign-key violation: publication history exists (published meanwhile).
    if (error.code === '23503') return { ok: false, error: 'This article has publication history and cannot be deleted.' };
    return { ok: false, error: `The draft could not be deleted (${error.message.slice(0, 160)}). Nothing was removed.` };
  }
  if (!gone?.length) return { ok: false, error: 'The draft was not deleted: it was published or changed meanwhile. Reload the page.' };
  return { ok: true, title: a.working_title };
}
