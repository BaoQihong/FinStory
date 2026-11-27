// Homepage front-page blocks (Phase 3C). Server components; render only the
// public card model built from live snapshots (lib/publishing/home.ts).
import Link from 'next/link';
import type { StoryCardModel } from '@/lib/publishing/home';
import { sectionName } from '@/content';
import { fmtDay } from '@/lib/format';
import { SeshatMark } from '@/components/site/SeshatMark';
import { LeadChartArt } from './LeadChartArt';

export function Masthead() {
  return (
    <header className="border-b border-cream-300">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-9 text-center sm:px-8 sm:pb-10 sm:pt-12">
        <SeshatMark className="mx-auto h-10 w-9 text-gold-500 sm:h-12 sm:w-11" />
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-[0.14em] text-navy-900 sm:text-7xl">SESHAT</h1>
        <p className="mt-3 font-display text-lg italic text-ink-soft sm:text-xl">The stories behind the numbers</p>
        <div className="mx-auto mt-7 flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-1 border-y border-cream-300 py-2.5 text-xs text-muted">
          <span className="hidden sm:inline">Independent financial journalism, measured against real data</span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <Link href="/about" className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2 hover:text-navy-900">
            About Seshat
          </Link>
        </div>
      </div>
    </header>
  );
}

function Byline({ s, className = '' }: { s: StoryCardModel; className?: string }) {
  return (
    <p className={`text-sm text-muted ${className}`}>
      <span className="font-semibold text-ink">{s.author.name}</span>
      {s.author.role ? <span>, {s.author.role}</span> : null}
      <span aria-hidden="true"> · </span>
      <time dateTime={s.date}>{fmtDay(s.date)}</time>
      {s.updated ? (
        <>
          <span aria-hidden="true"> · </span>
          <span>
            Updated <time dateTime={s.updated}>{fmtDay(s.updated)}</time>
          </span>
        </>
      ) : null}
    </p>
  );
}

export function FeaturedStory({ s, alone = false }: { s: StoryCardModel; alone?: boolean }) {
  const art = s.artwork;
  return (
    <section aria-labelledby="featured-headline" className={`mx-auto max-w-7xl px-5 pt-10 sm:px-8 sm:pt-14 ${alone ? 'pb-2' : 'pb-14 sm:pb-16'}`}>
      <div className={art ? 'grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14' : 'mx-auto max-w-4xl text-center'}>
        <div className="min-w-0">
          <p className={`kicker flex items-center gap-3 text-gold-700 ${art ? '' : 'justify-center'}`}>
            <span>{sectionName(s.section)}</span>
            <span aria-hidden="true" className="h-px w-8 bg-gold-500" />
            <span className="text-muted">Featured</span>
          </p>
          <h2
            id="featured-headline"
            className={`mt-5 font-display font-semibold leading-[1.05] tracking-[-0.015em] text-navy-900 text-balance ${art ? 'text-[2.35rem] sm:text-[3.4rem]' : 'text-[2.5rem] sm:text-6xl'}`}
          >
            <Link href={s.href} className="decoration-gold-500 decoration-[3px] underline-offset-8 hover:underline">
              {s.headline}
            </Link>
          </h2>
          <p className={`mt-6 font-serif text-xl leading-relaxed text-ink-soft ${art ? 'max-w-xl' : 'mx-auto max-w-2xl'}`}>{s.dek}</p>
          <div className={`mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 ${art ? '' : 'justify-center'}`}>
            <Link
              href={s.href}
              className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-3 text-sm font-semibold text-cream-50 transition-colors hover:bg-navy-700"
            >
              Read the story <span aria-hidden="true">→</span>
            </Link>
            <Byline s={s} />
          </div>
        </div>
        {art ? (
          <Link href={s.href} tabIndex={-1} aria-hidden="true" className="block min-w-0 transition-transform hover:-translate-y-0.5">
            <LeadChartArt chart={art} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function LatestCard({ s }: { s: StoryCardModel }) {
  return (
    <article className="group relative flex h-full min-w-0 flex-col border-t-2 border-navy-900 pt-5">
      <p className="kicker text-gold-700">{sectionName(s.section)}</p>
      <h3 className="mt-3 font-display text-[1.45rem] font-semibold leading-[1.15] text-navy-900 text-balance">
        <Link href={s.href} className="after:absolute after:inset-0 decoration-gold-500 decoration-2 underline-offset-4 group-hover:underline">
          {s.headline}
        </Link>
      </h3>
      <p className="mt-3 line-clamp-4 text-[0.95rem] leading-relaxed text-ink-soft">{s.dek}</p>
      <p className="mt-auto pt-4 text-xs text-muted">
        <time dateTime={s.date}>{fmtDay(s.date)}</time>
        <span aria-hidden="true"> · </span>
        {s.author.name}
      </p>
    </article>
  );
}

export function EmptyEdition() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-20 text-center sm:px-8 sm:py-28">
      <p className="kicker text-gold-700">First edition</p>
      <h2 className="mt-4 font-display text-3xl font-semibold text-navy-900 sm:text-4xl">Our first stories are on their way</h2>
      <p className="mt-5 font-serif text-lg leading-relaxed text-ink-soft">
        Seshat publishes a story when it is ready and checked against the data, not to fill a schedule. Please come back
        soon.
      </p>
      <Link href="/about" className="mt-8 inline-block text-sm font-semibold text-navy-800 underline decoration-gold-500 underline-offset-4 hover:text-navy-900">
        How Seshat works
      </Link>
    </section>
  );
}
