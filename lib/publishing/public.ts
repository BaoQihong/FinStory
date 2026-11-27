// Public data interface for published stories — the Phase 3B contract.
//
// Uses a cookie-less client with the publishable key, i.e. the `anon` role:
// RLS lets it read public.published_stories and nothing else. A story is
// returned only while it is live; unpublished articles, working drafts and
// earlier publications are unreachable through this interface by design.
// Every snapshot is re-validated against PublishedStoryV1 before use.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { PublishedStoryV1, type PublicStory } from './snapshot';
import { SLUG_PATTERN } from './rules';
import { HOME_PAGE_SIZE, resolveFeaturedId } from './home';

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type Row = { article_id: string; slug: string; revision: number; snapshot: unknown; first_published_at: string; published_at: string };

function toPublic(r: Row): PublicStory | null {
  const parsed = PublishedStoryV1.safeParse(r.snapshot);
  if (!parsed.success) {
    console.error(`[publishing] snapshot for ${r.slug} r${r.revision} failed validation`);
    return null;
  }
  return { id: r.article_id, slug: r.slug, revision: r.revision, firstPublishedAt: r.first_published_at, publishedAt: r.published_at, story: parsed.data };
}

/** The live story at /story/[slug], or null (unknown, unpublished or invalid). */
export async function getPublishedStory(slug: string): Promise<PublicStory | null> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null;
  const { data, error } = await anonClient()
    .from('published_stories')
    .select('article_id, slug, revision, snapshot, first_published_at, published_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`published story lookup failed: ${error.message}`);
  return data ? toPublic(data as Row) : null;
}

export type Homepage = {
  /** The lead story: the editor's live choice, else the newest live story. Page 1 only. */
  featured: PublicStory | null;
  /** Other live stories on this page, newest original publication first. */
  latest: PublicStory[];
  page: number;
  pageCount: number;
  /** Live stories in total (featured included). */
  total: number;
};

/**
 * Homepage content (Phase 3C). Reads only published_stories and the
 * single-row homepage_feature, both anon-readable by RLS. The featured story
 * never repeats in the latest list. Ordered by first publication date, so a
 * republish updates a story in place without moving it.
 */
export async function getHomepage(page = 1): Promise<Homepage> {
  const db = anonClient();
  const [feature, index] = await Promise.all([
    db.from('homepage_feature').select('article_id').maybeSingle(),
    db.from('published_stories').select('article_id').order('first_published_at', { ascending: false }).order('article_id').limit(5000),
  ]);
  if (feature.error) throw new Error(`homepage feature lookup failed: ${feature.error.message}`);
  if (index.error) throw new Error(`published story index failed: ${index.error.message}`);

  const ids = (index.data ?? []).map((r) => ({ id: r.article_id as string }));
  const featuredId = resolveFeaturedId((feature.data?.article_id as string | null) ?? null, ids);
  const rest = ids.filter((r) => r.id !== featuredId).map((r) => r.id);
  const pageCount = Math.max(1, Math.ceil(rest.length / HOME_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pageCount);
  const pageIds = rest.slice((p - 1) * HOME_PAGE_SIZE, p * HOME_PAGE_SIZE);
  const want = p === 1 && featuredId ? [featuredId, ...pageIds] : pageIds;
  if (!want.length) return { featured: null, latest: [], page: p, pageCount, total: ids.length };

  const { data, error } = await db
    .from('published_stories')
    .select('article_id, slug, revision, snapshot, first_published_at, published_at')
    .in('article_id', want);
  if (error) throw new Error(`homepage stories failed: ${error.message}`);
  const byId = new Map(((data ?? []) as Row[]).map((r) => [r.article_id, toPublic(r)]));
  const pick = (id: string) => byId.get(id) ?? null;
  const latest = pageIds.map(pick).filter((s): s is PublicStory => !!s);
  let featured = p === 1 && featuredId ? pick(featuredId) : null;
  // A featured snapshot that fails validation is skipped: the next story leads.
  if (p === 1 && featuredId && !featured) featured = latest.shift() ?? null;
  return {
    featured,
    latest,
    page: p,
    pageCount,
    total: ids.length,
  };
}

/** Live stories, most recently published first (for listings and static params). */
export async function listPublishedStories(limit = 50): Promise<PublicStory[]> {
  const { data, error } = await anonClient()
    .from('published_stories')
    .select('article_id, slug, revision, snapshot, first_published_at, published_at')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`published story listing failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(toPublic).filter((s): s is PublicStory => !!s);
}
