// Public homepage (Phase 3C). A front page built only from live published
// snapshots (public.published_stories via the anon role) and the editor's
// featured choice (public.homepage_feature). Drafts, history and editor data
// are unreachable from here by construction (D-044, D-046).
//
// Rendering: per request, no data cache (as /story/[slug], D-047), so
// publish, republish, unpublish and featuring take effect on the next visit.
import Link from 'next/link';
import { getHomepage } from '@/lib/publishing/public';
import { parsePage, toCard, type StoryCardModel } from '@/lib/publishing/home';
import { EmptyEdition, FeaturedStory, LatestCard, Masthead } from '@/components/home/Front';

export const instant = false;

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const page = parsePage((await searchParams).page);
  const home = await getHomepage(page);
  const featured = home.featured ? toCard(home.featured, true) : null;
  const latest = home.latest.map((s) => toCard(s)).filter((c): c is StoryCardModel => !!c);

  if (!featured && !latest.length) {
    return (
      <>
        <Masthead />
        <EmptyEdition />
      </>
    );
  }

  return (
    <>
      <Masthead />
      {featured ? <FeaturedStory s={featured} alone={!latest.length} /> : null}

      {latest.length ? (
        <>
          {featured ? (
            <div className="mx-auto max-w-7xl px-5 sm:px-8">
              <div className="rule-seshat" />
            </div>
          ) : null}
          <section id="latest" aria-labelledby="latest-heading" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-14 sm:px-8">
            <h2 id="latest-heading" className="font-display text-3xl font-semibold text-navy-900">
              {home.page > 1 ? `Latest stories · page ${home.page}` : 'Latest stories'}
            </h2>
            <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {latest.map((s) => (
                <LatestCard key={s.id} s={s} />
              ))}
            </div>
            {home.pageCount > 1 ? (
              <nav aria-label="More stories" className="mt-14 flex items-center justify-between border-t border-cream-300 pt-6 text-sm font-semibold text-navy-800">
                {home.page > 1 ? (
                  <Link href={home.page === 2 ? '/#latest' : `/?page=${home.page - 1}#latest`} className="hover:text-navy-900">
                    ← Newer stories
                  </Link>
                ) : (
                  <span />
                )}
                <span className="font-normal text-muted">
                  Page {home.page} of {home.pageCount}
                </span>
                {home.page < home.pageCount ? (
                  <Link href={`/?page=${home.page + 1}#latest`} className="hover:text-navy-900">
                    Older stories →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}
