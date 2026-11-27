// Public article page (Phase 3B.1). Renders ONLY the live published snapshot
// (public.published_stories via the anon role); working drafts, history and
// editor data are unreachable from here by construction (D-044, D-046).
//
// Rendering: blocking, per request, uncached (D-047). The lookup is awaited
// outside any Suspense boundary so an unknown, unpublished or deleted slug is
// answered with a real HTTP 404 before streaming starts, and publish /
// republish / unpublish take effect on the next request whichever path
// changed the row.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getPublishedStory } from '@/lib/publishing/public';
import { fromSnapshot, readingMinutesOf } from '@/lib/content/render-model';
import { resolveTokens } from '@/lib/content/tokens';
import { sectionName } from '@/content';
import { ArticleView } from '@/components/article/ArticleView';

export const instant = false;

// One database read per request, shared by generateMetadata and the page.
const load = cache((slug: string) => getPublishedStory(slug));

export async function generateMetadata({ params }: PageProps<'/story/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const pub = await load(slug);
  if (!pub) return { title: 'Story not found', robots: { index: false } };
  const { story } = pub.story;
  const t = (s: string) => resolveTokens(s, pub.story.data);
  return {
    title: t(story.headline),
    description: t(story.dek),
    alternates: { canonical: `/story/${pub.slug}` },
    authors: [{ name: pub.story.meta.author.name }],
  };
}

export default async function PublicStoryPage({ params }: PageProps<'/story/[slug]'>) {
  const { slug } = await params;
  const pub = await load(slug);
  if (!pub) notFound();
  const model = fromSnapshot(pub.story, pub);
  const minutes = readingMinutesOf(model.article, (s) => resolveTokens(s, model.data));
  return <ArticleView article={model.article} data={model.data} sectionName={sectionName(model.article.section)} readingMinutes={minutes} mode="public" />;
}
