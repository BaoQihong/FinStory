import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { articles, getArticle, leadStory, sectionName } from '@/content';
import type { PreviewArticle } from '@/lib/content/types';
import { getBondComebackData } from '@/lib/stories/bond-comeback';
import { resolveTokens } from '@/lib/content/tokens';
import { fromPublished, readingMinutesOf } from '@/lib/content/render-model';
import { ArticleView } from '@/components/article/ArticleView';
import { InPreparationBadge } from '@/components/editorial/StoryCard';

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<'/stories/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return {};
  return {
    title: a.shortHeadline ?? a.headline,
    description: a.dek,
    robots: a.status === 'preview' ? { index: false } : undefined,
  };
}

export default async function StoryPage({ params }: PageProps<'/stories/[slug]'>) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  if (article.status === 'preview') return <PreviewPage article={article} />;

  const model = fromPublished(article, getBondComebackData());
  const minutes = readingMinutesOf(model.article, (s) => resolveTokens(s, model.data));
  return <ArticleView article={model.article} data={model.data} sectionName={sectionName(article.section)} readingMinutes={minutes} />;
}

function PreviewPage({ article }: { article: PreviewArticle }) {
  return (
    <article>
      <header className="bg-navy-900 text-cream-50">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/section/${article.section}`} className="kicker rounded bg-gold-400 px-2.5 py-1 text-navy-950 hover:bg-gold-300">
              {sectionName(article.section)}
            </Link>
            <InPreparationBadge tone="dark" />
          </div>
          <h1 className="mt-6 font-display text-[2.3rem] font-semibold leading-[1.06] text-balance sm:text-6xl">{article.headline}</h1>
          <p className="mt-6 max-w-2xl font-serif text-lg leading-relaxed text-cream-200 sm:text-xl">{article.dek}</p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="rounded-2xl border border-cream-300 bg-cream-50 p-6 sm:p-8">
          <p className="kicker text-gold-700">This story is in preparation</p>
          <p className="mt-3 text-ink-soft">
            Our editors are still reporting this piece, so there is no full article yet. Here is what it will cover:
          </p>
          <ul className="mt-5 space-y-3">
            {article.plannedCoverage.map((c) => (
              <li key={c} className="flex gap-3 font-serif text-lg leading-relaxed text-ink">
                <span aria-hidden="true" className="text-gold-500">
                  ✦
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 border-t border-cream-300 pt-8">
          <p className="text-sm text-muted">Read the current lead story</p>
          <Link href={`/stories/${leadStory.slug}`} className="group mt-2 block">
            <span className="font-display text-2xl font-semibold leading-tight text-navy-900 group-hover:underline decoration-gold-500 underline-offset-4">
              {leadStory.headline}
            </span>
            <span className="mt-2 block text-ink-soft">{leadStory.dek}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
