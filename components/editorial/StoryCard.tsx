import Link from 'next/link';
import type { Article } from '@/lib/content/types';
import { fmtDay } from '@/lib/format';

export function InPreparationBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider ${
        tone === 'dark' ? 'border-gold-300/40 text-gold-300' : 'border-cream-300 bg-cream-100 text-muted'
      }`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      In preparation
    </span>
  );
}

/** Supporting story preview. Preview stories are visibly marked and lead to a preview page, never a fake article. */
export function StoryCard({ article, sectionName }: { article: Article; sectionName: string }) {
  const preview = article.status === 'preview';
  return (
    <article className="group relative flex h-full flex-col border-t-2 border-navy-900 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="kicker text-gold-700">{sectionName}</span>
        {preview ? <InPreparationBadge /> : null}
      </div>
      <h3 className="mt-3 font-display text-[1.45rem] font-semibold leading-[1.15] text-navy-900">
        <Link href={`/stories/${article.slug}`} className="after:absolute after:inset-0 group-hover:underline decoration-gold-500 decoration-2 underline-offset-4">
          {article.headline}
        </Link>
      </h3>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">{article.dek}</p>
      <p className="mt-auto pt-4 text-xs text-muted">
        {preview ? 'Coming to Seshat · see what we’re working on' : `${article.byline.name} · ${fmtDay(article.publishedAt)}`}
      </p>
    </article>
  );
}
