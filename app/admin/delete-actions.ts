'use server';
// Delete a never-published draft (D-062). The editor's click, after a
// confirmation dialog, authorises it. Logic and guards: lib/studio/delete-draft.ts.
import { revalidatePath } from 'next/cache';
import { getEditor } from '@/lib/studio/auth';
import { deleteDraftCore, type DeleteDb, type DeleteResult } from '@/lib/studio/delete-draft';

export async function deleteDraft(input: { articleId: string }): Promise<DeleteResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const r = await deleteDraftCore(ed.db as unknown as DeleteDb, String(input?.articleId ?? ''));
  if (r.ok) revalidatePath('/admin');
  return r;
}
