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
