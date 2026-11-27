'use server';

// Publishing server actions. Publishing is always an explicit editor action:
// nothing in the generation pipeline calls these. Authorization is enforced
// three times — getEditor() here, is_editor() inside the SECURITY DEFINER
// database functions, and RLS on every table.
import { revalidatePath } from 'next/cache';
import { getEditor } from '@/lib/studio/auth';
import { articles as staticArticles } from '@/content';
import { checkPublication, RESERVED_SLUGS, slugify, slugProblem, uniqueSlug, publicationState, type PublicationIssue, type PublicationState } from '@/lib/publishing/rules';
import { toPublicSnapshot } from '@/lib/publishing/snapshot';
import type { ServerSupabase } from '@/lib/supabase/server';

const reserved = new Set([...RESERVED_SLUGS, ...staticArticles.map((a) => a.slug)]);
const today = () => new Date().toISOString().slice(0, 10);

type ArticleRow = {
  id: string;
  revision: number;
  content: unknown;
  is_temporary: boolean;
  slug: string | null;
  is_live: boolean;
  first_published_at: string | null;
  published_revision: number;
  published_source_revision: number | null;
};
const COLS = 'id, revision, content, is_temporary, slug, is_live, first_published_at, published_revision, published_source_revision';

async function load(db: ServerSupabase, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db.from('articles').select(COLS).eq('id', id).maybeSingle();
  if (!data) return null;
  const { data: jobs } = await db.from('generation_jobs').select('id').eq('article_id', id).in('status', ['queued', 'running']).limit(1);
  return { article: data as ArticleRow, generating: !!jobs?.length };
}

async function suggestSlug(db: ServerSupabase, a: ArticleRow, headline: string) {
  if (a.slug) return a.slug;
  const base = slugify(headline);
  const { data } = await db.from('articles').select('slug').like('slug', `${base.slice(0, 70)}%`).neq('id', a.id);
  return uniqueSlug(base, new Set((data ?? []).map((r) => r.slug as string)), reserved);
}

// ── Preflight (shown in the confirmation dialog) ─────────────────────────
export type Preflight =
  | {
      ok: true;
      state: PublicationState;
      revision: number;
      nextPublication: number;
      headline: string;
      slug: string;
      slugLocked: boolean;
      canPublish: boolean;
      blocking: PublicationIssue[];
      warnings: PublicationIssue[];
    }
  | { ok: false; error: string };

export async function publicationPreflight(articleId: string): Promise<Preflight> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const r = await load(ed.db, articleId);
  if (!r) return { ok: false, error: 'Draft not found.' };
  const { article: a, generating } = r;
  const check = checkPublication({ content: a.content, isTemporary: a.is_temporary, generating, today: today() });
  const headline = check.article?.story.headline ?? '';
  return {
    ok: true,
    state: publicationState(a),
    revision: a.revision,
    nextPublication: a.published_revision + 1,
    headline,
    slug: await suggestSlug(ed.db, a, headline),
    slugLocked: !!a.slug,
    canPublish: check.ok,
    blocking: check.blocking,
    warnings: check.warnings,
  };
}

// ── Publish / republish ──────────────────────────────────────────────────
export type PublishResult =
  | { ok: true; outcome: 'published' | 'unchanged'; slug: string; publication: number; sourceRevision: number }
  | { ok: false; error: string; blocking?: PublicationIssue[] };

const DB_ERRORS: Record<string, string> = {
  not_authorised: 'This account is not authorised to publish.',
  not_found: 'Draft not found.',
  no_content: 'The draft has no content yet.',
  temporary_draft: 'Temporary (test) drafts cannot be published.',
  generation_running: 'Generation is running for this draft. Wait for it to finish before publishing.',
  stale_revision: 'The draft changed while you were reviewing it. Reopen the publish dialog to review the latest revision.',
  slug_required: 'Choose a URL slug.',
  slug_mismatch: 'This article already has a permanent URL slug.',
  slug_taken: 'That URL slug is already used by another article. Choose another.',
  invalid_snapshot: 'The publication snapshot was invalid.',
};
const dbError = (message: string) => {
  const code = message.match(/^([a-z_]+):/)?.[1];
  return (code && DB_ERRORS[code]) || `Publishing failed: ${message.slice(0, 200)}`;
};

export async function publishArticle(input: { articleId: string; expectedRevision: number; slug?: string; note?: string }): Promise<PublishResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const { db } = ed;
  const r = await load(db, String(input?.articleId ?? ''));
  if (!r) return { ok: false, error: 'Draft not found.' };
  const { article: a, generating } = r;
  if (a.revision !== input.expectedRevision)
    return { ok: false, error: `The draft is now at revision ${a.revision}, not the revision ${input.expectedRevision} you reviewed. Reopen the publish dialog to review the latest revision.` };

  // Already live at exactly this revision: a duplicate submission is a no-op.
  if (a.is_live && a.published_source_revision === a.revision)
    return { ok: true, outcome: 'unchanged', slug: a.slug!, publication: a.published_revision, sourceRevision: a.revision };

  const check = checkPublication({ content: a.content, isTemporary: a.is_temporary, generating, today: today() });
  if (!check.ok || !check.article) return { ok: false, error: 'This draft cannot be published yet. Resolve the blocking issues listed.', blocking: check.blocking };

  let slug = a.slug;
  if (!slug) {
    slug = String(input.slug ?? '').trim().toLowerCase();
    const problem = slugProblem(slug, reserved);
    if (problem) return { ok: false, error: problem };
  }
  const note = String(input.note ?? '').trim().slice(0, 500) || null;

  const { data, error } = await db.rpc('publish_article', {
    p_article: a.id,
    p_expected_revision: a.revision,
    p_slug: slug,
    p_snapshot: toPublicSnapshot(check.article),
    p_note: note,
  });
  if (error) return { ok: false, error: dbError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: 'published' | 'unchanged'; slug: string; published_revision: number; published_source_revision: number } | undefined;
  if (!row) return { ok: false, error: 'Publishing returned no result.' };
  revalidatePath(`/story/${row.slug}`);
  revalidatePath(`/admin/drafts/${a.id}`);
  revalidatePath('/admin');
  return { ok: true, outcome: row.outcome, slug: row.slug, publication: row.published_revision, sourceRevision: row.published_source_revision };
}

// ── Unpublish ────────────────────────────────────────────────────────────
export type UnpublishResult = { ok: true; outcome: 'unpublished' | 'unchanged' } | { ok: false; error: string };

export async function unpublishArticle(articleId: string): Promise<UnpublishResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  if (!/^[0-9a-f-]{36}$/.test(String(articleId))) return { ok: false, error: 'Draft not found.' };
  const { data: art } = await ed.db.from('articles').select('slug').eq('id', articleId).maybeSingle();
  const { data, error } = await ed.db.rpc('unpublish_article', { p_article: articleId });
  if (error) return { ok: false, error: dbError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: 'unpublished' | 'unchanged' } | undefined;
  // The public page is rendered per request (D-047); this also clears any future route cache.
  if (art?.slug) revalidatePath(`/story/${art.slug}`);
  revalidatePath(`/admin/drafts/${articleId}`);
  revalidatePath('/admin');
  return { ok: true, outcome: row?.outcome ?? 'unchanged' };
}
