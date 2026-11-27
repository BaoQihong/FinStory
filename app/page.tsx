import Link from 'next/link';
import { articles, leadStory, sectionName, sections } from '@/content';
import { getBondComebackData } from '@/lib/stories/bond-comeback';
import { resolveTokens } from '@/lib/content/tokens';
import { readingMinutes } from '@/lib/content/reading-time';
import { fmtDay } from '@/lib/format';
import { StoryCard } from '@/components/editorial/StoryCard';
import { LeadVisual } from '@/components/home/LeadVisual';

export default function HomePage() {
  const data = getBondComebackData();
  const t = (s: string) => resolveTokens(s, data);
  const lead = leadStory;
  const supporting = articles.filter((a) => a.slug !== lead.slug);
  const longNominal = data.charts.longView.series.find((s) => s.key === 'nominal')!.points;

  return (
    <>
      {/* Edition line */}
      <div className="border-b border-cream-300 bg-cream-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs text-muted sm:px-8">
          <span>
            Edition of <time dateTime={lead.publishedAt}>{fmtDay(lead.publishedAt)}</time>
          </span>
          <span>Prototype edition · Data to {fmtDay(data.cutoff)}</span>
        </div>
      </div>

      {/* Lead story */}
      <section aria-labelledby="lead-headline" className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <p className="kicker flex items-center gap-3 text-gold-700">
              <span>Lead story</span>
              <span aria-hidden="true" className="h-px w-8 bg-gold-500" />
              <Link href={`/section/${lead.section}`} className="hover:text-navy-900">
                {sectionName(lead.section)}
              </Link>
            </p>
            <h1 id="lead-headline" className="mt-5 font-display text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.015em] text-navy-900 text-balance sm:text-6xl">
              <Link href={`/stories/${lead.slug}`} className="decoration-gold-500 decoration-[3px] underline-offset-8 hover:underline">
                {lead.headline}
              </Link>
            </h1>
            <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-ink-soft">{lead.dek}</p>
            <ul className="mt-6 max-w-xl space-y-2.5 border-l-2 border-gold-500 pl-5 text-[0.98rem] leading-relaxed text-ink">
              {lead.keyPoints.slice(0, 2).map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href={`/stories/${lead.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-3 text-sm font-semibold text-cream-50 transition-colors hover:bg-navy-700"
              >
                Read the story <span aria-hidden="true">→</span>
              </Link>
              <span className="text-sm text-muted">
                {lead.byline.name} · {readingMinutes(lead, t)} min read
              </span>
            </div>
          </div>
          <Link href={`/stories/${lead.slug}`} aria-label={`${lead.shortHeadline ?? lead.headline}: the chart`} className="block transition-transform hover:-translate-y-0.5">
            <LeadVisual
              points={longNominal}
              peak={data.facts.y10Peak.value}
              peakDate={data.facts.y10Peak.date!}
              sinceLabel={t('{y10PeakPrevSince}')}
            />
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="rule-seshat" />
      </div>

      {/* Supporting stories */}
      <section aria-labelledby="more-stories" className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 id="more-stories" className="font-display text-3xl font-semibold text-navy-900">
            Also in Seshat
          </h2>
          <p className="hidden text-sm text-muted sm:block">Stories in preparation for upcoming editions</p>
        </div>
        <div className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
          {supporting.map((a) => (
            <StoryCard key={a.slug} article={a} sectionName={sectionName(a.section)} />
          ))}
        </div>
      </section>

      {/* Sections */}
      <section aria-labelledby="sections" className="bg-cream-50">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <h2 id="sections" className="font-display text-3xl font-semibold text-navy-900">
            Explore by section
          </h2>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-cream-300 bg-cream-300 sm:grid-cols-2 lg:grid-cols-4">
            {sections.map((s) => {
              const count = articles.filter((a) => a.section === s.key).length;
              return (
                <li key={s.key} className="bg-cream-50">
                  <Link href={`/section/${s.key}`} className="group block h-full p-6 hover:bg-cream-100">
                    <span className="font-display text-2xl font-semibold text-navy-900 group-hover:underline decoration-gold-500 underline-offset-4">
                      {s.name}
                    </span>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.description}</p>
                    <p className="mt-4 text-xs text-muted">
                      {count} {count === 1 ? 'story' : 'stories'}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Seshat stories are led by editorial judgment and checked against published data. We label what the numbers
            show, what is established context, and what is our own view.{' '}
            <Link href="/about#standards" className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2">
              Our standards
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
