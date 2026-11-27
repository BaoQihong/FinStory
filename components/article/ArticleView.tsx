import Link from 'next/link';
import type { PublishedArticle, Scenario } from '@/lib/content/types';
import type { BondComebackData } from '@/lib/stories/bond-comeback/build';
import { resolveTokens } from '@/lib/content/tokens';
import { fmtDay } from '@/lib/format';
import { ChartFigure } from '@/components/charts/ChartFigure';
import { IndicatorCard } from '@/components/charts/IndicatorCard';
import { YieldSplit } from '@/components/charts/YieldSplit';
import { ChapterNav, type Chapter } from '@/components/editorial/ChapterNav';
import { EvidenceKey, EvidenceTag } from '@/components/editorial/EvidenceTag';
import { HeroPattern } from '@/components/editorial/HeroPattern';
import { AssetIcon } from './AssetIcon';

type Props = { article: PublishedArticle; data: BondComebackData; sectionName: string; readingMinutes: number };

export function ArticleView({ article, data, sectionName, readingMinutes }: Props) {
  const t = (s: string) => resolveTokens(s, data);
  const chapters: Chapter[] = [
    { id: article.narrative.id, label: article.narrative.label, blurb: 'What happened and why it matters' },
    { id: article.macro.id, label: article.macro.label, blurb: 'The key numbers in context' },
    { id: article.analytics.id, label: article.analytics.label, blurb: 'Causes, effects and implications' },
    { id: article.outlook.id, label: article.outlook.label, blurb: 'Scenarios and what to watch' },
  ];
  const chart = (id: string) => data.charts[id as keyof typeof data.charts];

  return (
    <article>
      {/* ── Layer 1 — Headline ─────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-navy-900 text-cream-50">
        <HeroPattern className="pointer-events-none absolute inset-y-0 right-0 h-full w-full opacity-70 md:w-[62%] md:opacity-100" />
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16">
          <nav aria-label="Breadcrumb" className="text-sm">
            <Link href={`/section/${article.section}`} className="kicker rounded bg-gold-400 px-2.5 py-1 text-navy-950 hover:bg-gold-300">
              {sectionName}
            </Link>
          </nav>
          <h1 className="mt-6 max-w-4xl font-display text-[2.35rem] font-semibold leading-[1.05] tracking-[-0.015em] text-balance sm:text-6xl lg:text-[4.25rem]">
            {article.headline}
          </h1>
          <p className="mt-6 max-w-2xl font-serif text-lg leading-relaxed text-cream-200 sm:text-xl">{article.dek}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-cream-200">
            <span>
              By <span className="font-semibold text-cream-50">{article.byline.name}</span>
              <span className="text-cream-200/70"> · {article.byline.role}</span>
            </span>
            <span aria-hidden="true" className="hidden h-4 w-px bg-white/25 sm:block" />
            <time dateTime={article.publishedAt}>{fmtDay(article.publishedAt)}</time>
            <span>{readingMinutes} min read</span>
            <span className="text-cream-200/70">Data to {fmtDay(article.dataCutoff)}</span>
          </div>
        </div>
      </header>

      <ChapterNav chapters={chapters} variant="bar" />

      {/* The story in 30 seconds */}
      <section aria-labelledby="key-points" className="border-b border-cream-300 bg-cream-50">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <h2 id="key-points" className="kicker text-gold-700">
            The story in 30 seconds
          </h2>
          <ol className="mt-5 grid gap-6 md:grid-cols-3 md:gap-10">
            {article.keyPoints.map((k, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-display text-3xl font-semibold leading-none text-gold-500" aria-hidden="true">
                  {i + 1}
                </span>
                <p className="text-[1.02rem] leading-relaxed text-ink">{t(k)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-12 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 lg:pt-16">
        <aside className="hidden lg:block">
          <ChapterNav chapters={chapters} variant="rail" />
        </aside>

        <div className="min-w-0 space-y-20 sm:space-y-28">
          {/* ── Layer 2 — Narrative ─────────────────────────────────── */}
          <section id={article.narrative.id} aria-labelledby="h-story" className="max-w-[42rem]">
            <ChapterHeading id="h-story" n={1} label={article.narrative.label} title={article.narrative.title} hideTitle />
            <div className="prose-seshat mt-2">
              {article.narrative.blocks.map((b, i) => {
                if (b.type === 'p') return <p key={i}>{t(b.text)}</p>;
                if (b.type === 'h3') return <h3 key={i}>{t(b.text)}</h3>;
                if (b.type === 'pullquote')
                  return (
                    <blockquote key={i} className="my-10 border-y border-gold-500/50 py-6 text-center font-display text-[1.65rem] italic leading-snug text-navy-800 sm:-mx-8 sm:text-[1.9rem]">
                      “{t(b.text)}”
                    </blockquote>
                  );
                return (
                  <div key={i} className="not-prose my-10 font-sans">
                    <ChartFigure data={chart(b.chartId)} question={t(b.question)} takeaway={t(b.takeaway)} />
                  </div>
                );
              })}
            </div>
            <p className="mt-10 flex items-center gap-2 text-sm text-ink-soft">
              <span aria-hidden="true" className="text-gold-500">
                ✦
              </span>
              Want the evidence?{' '}
              <a href={`#${article.macro.id}`} className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-4">
                Continue to the numbers
              </a>
            </p>
          </section>

          {/* ── Layer 3 — Macro ─────────────────────────────────────── */}
          <section id={article.macro.id} aria-labelledby="h-macro">
            <ChapterHeading id="h-macro" n={2} label={article.macro.label} title={article.macro.title} intro={t(article.macro.intro)} />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {article.macro.indicators.map((n) => {
                const card = data.indicators.find((c) => c.key === n.key)!;
                return <IndicatorCard key={n.key} card={card} note={t(n.note)} />;
              })}
            </div>
            <div className="mt-10 space-y-8">
              {article.macro.charts.map((c) => (
                <ChartFigure key={c.chartId} data={chart(c.chartId)} question={t(c.question)} takeaway={t(c.takeaway)} />
              ))}
            </div>
            <div className="mt-10">
              <h3 className="font-display text-2xl font-semibold text-navy-900">What changed</h3>
              <ul className="mt-5 grid gap-6 md:grid-cols-3">
                {article.macro.explainers.map((e) => (
                  <li key={e.title} className="border-l-2 border-gold-500 pl-4">
                    <EvidenceTag evidence={e.evidence} />
                    <h4 className="mt-2 font-semibold leading-snug text-ink">{t(e.title)}</h4>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t(e.text)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Layer 4 — Analytics ─────────────────────────────────── */}
          <section id={article.analytics.id} aria-labelledby="h-analytics">
            <ChapterHeading id="h-analytics" n={3} label={article.analytics.label} title={article.analytics.title} intro={t(article.analytics.intro)} />
            <div className="mt-6 rounded-lg bg-cream-50 px-4 py-3">
              <EvidenceKey />
            </div>

            <div className="mt-8">
              <h3 className="font-display text-2xl font-semibold text-navy-900">{article.analytics.chain.title}</h3>
              <ol className="mt-5 grid gap-3 md:grid-cols-4 md:gap-0">
                {article.analytics.chain.steps.map((s, i, all) => (
                  <li key={s.title} className="relative flex md:pr-6">
                    <div className="flex-1 rounded-xl border border-cream-300 bg-cream-50 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-2xl font-semibold text-gold-500" aria-hidden="true">
                          {i + 1}
                        </span>
                        <EvidenceTag evidence={s.evidence} />
                      </div>
                      <h4 className="mt-3 font-semibold leading-snug text-navy-900">{s.title}</h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t(s.text)}</p>
                    </div>
                    {i < all.length - 1 ? (
                      <span aria-hidden="true" className="absolute right-0 top-1/2 hidden w-6 -translate-y-1/2 text-center text-gold-500 md:block">
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-10 grid gap-8 xl:grid-cols-2">
              <YieldSplit
                rows={data.split}
                question={t(article.analytics.split.question)}
                takeaway={t(article.analytics.split.takeaway)}
                note={t(article.analytics.split.note)}
              />
              <ChartFigure
                data={chart(article.analytics.chart.chartId)}
                question={t(article.analytics.chart.question)}
                takeaway={t(article.analytics.chart.takeaway)}
              />
            </div>

            <div className="mt-12">
              <h3 className="font-display text-2xl font-semibold text-navy-900">{article.analytics.implications.title}</h3>
              <p className="mt-2 max-w-2xl text-sm text-ink-soft">{t(article.analytics.implications.intro)}</p>
              <div className="mt-5 divide-y divide-cream-300 rounded-2xl border border-cream-300 bg-cream-50">
                {article.analytics.implications.items.map((it) => (
                  <div key={it.asset} className="grid gap-4 p-5 sm:grid-cols-[10rem_1fr_1fr] sm:gap-6 sm:p-6">
                    <div className="flex items-center gap-3">
                      <AssetIcon kind={it.icon} className="h-8 w-8 text-gold-700" />
                      <h4 className="font-display text-lg font-semibold text-navy-900">{it.asset}</h4>
                    </div>
                    <div>
                      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        What we see <EvidenceTag evidence={it.showsEvidence} />
                      </p>
                      <p className="text-sm leading-relaxed text-ink">{t(it.shows)}</p>
                    </div>
                    <div>
                      <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        What it could mean <EvidenceTag evidence="interpretation" />
                      </p>
                      <p className="text-sm leading-relaxed text-ink">{t(it.couldMean)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Layer 5 — Outlook ───────────────────────────────────── */}
          <section id={article.outlook.id} aria-labelledby="h-outlook">
            <ChapterHeading id="h-outlook" n={4} label={article.outlook.label} title={article.outlook.title} intro={t(article.outlook.intro)} />
            <p className="mt-6 flex items-start gap-3 rounded-lg border border-gold-500/40 bg-[#fbf1dc] px-4 py-3 text-sm leading-relaxed text-ink">
              <span aria-hidden="true" className="mt-0.5 text-gold-700">
                ◇
              </span>
              <span>
                <strong className="font-semibold">Illustrative scenarios.</strong> {t(article.outlook.disclaimer)}
              </span>
            </p>
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {article.outlook.scenarios.map((s, i) => (
                <ScenarioCard key={s.key} s={s} n={i + 1} t={t} />
              ))}
            </div>
          </section>

          {/* ── Sources & method ────────────────────────────────────── */}
          <section aria-labelledby="h-sources" className="max-w-[48rem] border-t border-cream-300 pt-10">
            <h2 id="h-sources" className="font-display text-2xl font-semibold text-navy-900">
              Sources &amp; method
            </h2>
            <ul className="mt-5 space-y-3 text-sm">
              {data.sources.map((s) => (
                <li key={s.seriesId} className="leading-relaxed text-ink-soft">
                  <a href={s.url} rel="noopener" className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2">
                    {s.name}
                  </a>{' '}
                  — FRED series <code className="text-xs">{s.seriesId}</code>, {s.units.toLowerCase()}, {s.frequency.toLowerCase()}.
                  Latest observation {fmtDay(s.lastObservation)}; retrieved {fmtDay(s.retrievedAt.slice(0, 10))}.
                </li>
              ))}
            </ul>
            <details className="group mt-6">
              <summary className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800">
                How we calculated the numbers
                <svg viewBox="0 0 12 12" className="chev h-3 w-3 transition-transform" aria-hidden="true">
                  <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
                {article.methodology.map((m) => (
                  <li key={m}>{t(m)}</li>
                ))}
              </ul>
            </details>
            <p className="mt-6 text-xs leading-relaxed text-muted">
              Prototype edition: this demonstration article is a draft awaiting editorial review. It is general information and education, not investment advice. Past movements in yields do not
              predict future ones.
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}

function ChapterHeading({
  id,
  n,
  label,
  title,
  intro,
  hideTitle,
}: {
  id: string;
  n: number;
  label: string;
  title: string;
  intro?: string;
  hideTitle?: boolean;
}) {
  return (
    <header className="max-w-3xl">
      <p className="kicker flex items-center gap-3 text-gold-700">
        <span className="tabular-nums">0{n}</span>
        <span aria-hidden="true" className="h-px w-8 bg-gold-500" />
        {label}
      </p>
      <h2 id={id} className={hideTitle ? 'sr-only' : 'mt-3 font-display text-[2rem] font-semibold leading-[1.1] text-navy-900 sm:text-[2.6rem]'}>
        {hideTitle ? label : title}
      </h2>
      {intro ? <p className="mt-4 font-serif text-lg leading-relaxed text-ink-soft">{intro}</p> : null}
    </header>
  );
}

function ScenarioCard({ s, n, t }: { s: Scenario; n: number; t: (x: string) => string }) {
  return (
    <article className="flex flex-col rounded-2xl border border-cream-300 bg-cream-50 p-6">
      <p className="kicker text-gold-700">Scenario {n}</p>
      <h3 className="mt-2 font-display text-2xl font-semibold leading-tight text-navy-900">{s.name}</h3>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{t(s.summary)}</p>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">What would cause it</h4>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
        {s.conditions.map((c) => (
          <li key={c} className="flex gap-2">
            <span aria-hidden="true" className="text-gold-500">
              —
            </span>
            {t(c)}
          </li>
        ))}
      </ul>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">Why it matters</h4>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t(s.whyItMatters)}</p>

      <details className="group mt-5 border-t border-cream-200 pt-4">
        <summary className="flex items-center justify-between text-sm font-semibold text-navy-800">
          Assets affected &amp; what to watch
          <svg viewBox="0 0 12 12" className="chev h-3.5 w-3.5 transition-transform" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <dl className="mt-3 space-y-2 text-sm">
          {s.assets.map((a) => (
            <div key={a.asset} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="font-semibold text-ink">{a.asset}</dt>
              <dd className="text-ink-soft">{t(a.effect)}</dd>
            </div>
          ))}
        </dl>
        <h5 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Signposts to watch</h5>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          {s.watch.map((w) => (
            <li key={w} className="flex gap-2">
              <span aria-hidden="true" className="text-gold-500">
                ◦
              </span>
              {t(w)}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
