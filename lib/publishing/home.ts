// Homepage helpers (Phase 3C) — pure code, no database, unit-tested.
//
// The homepage reads only live snapshots (public.published_stories) and the
// single-row public.homepage_feature through lib/publishing/public.ts. These
// helpers decide which story leads and shape snapshots into the small, public
// card model the page renders. Nothing here sees a working draft.
import type { ChartData, DateFact, Fact } from '../data/display.ts';
import type { Point } from '../data/types.ts';
import { resolveTokens, type TokenContext } from '../content/tokens.ts';
import type { PublicStory } from './snapshot.ts';

/** Latest stories per homepage page (the featured story is extra, on page 1 only). */
export const HOME_PAGE_SIZE = 12;
/** Upper bound on ?page=; beyond it the page is treated as page 1. */
const MAX_PAGE = 500;

/** ?page= → 1-based page number; anything malformed is page 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^[1-9]\d{0,3}$/.test(v)) return 1;
  const n = Number(v);
  return n <= MAX_PAGE ? n : 1;
}

/**
 * Which live article leads the homepage: the editor's explicit choice while
 * it is live, otherwise the most recently (first-)published live article.
 * `explicit` is already null after an unpublish (ON DELETE SET NULL); the
 * live-list check also covers a feature that is no longer in the index.
 * (A featured snapshot that fails validation is handled in getHomepage.)
 */
export function resolveFeaturedId(explicit: string | null, newestFirst: { id: string }[]): string | null {
  if (explicit && newestFirst.some((s) => s.id === explicit)) return explicit;
  return newestFirst[0]?.id ?? null;
}

export type StoryCardModel = {
  id: string;
  href: string;
  section: PublicStory['story']['meta']['section'];
  headline: string;
  dek: string;
  author: { name: string; role: string };
  /** Original publication date (YYYY-MM-DD). */
  date: string;
  /** Latest republication date, when it differs from `date`. */
  updated?: string;
  /** Real-data artwork for the lead slot; null = typographic layout. */
  artwork: LeadChart | null;
};

export type LeadChart = {
  question: string;
  series: { label: string; points: Point[] }[];
  unit: { prefix: string; suffix: string };
  first: string;
  last: string;
  source: string;
};

const MAX_POINTS = 240;
function thin(points: Point[]): Point[] {
  if (points.length <= MAX_POINTS) return points;
  const step = (points.length - 1) / (MAX_POINTS - 1);
  return Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round(i * step)]);
}

/**
 * The article's own lead chart (first macro chart, else first analytics
 * chart) reduced to at most two lines — the homepage's only "artwork".
 * Returns null when the article has no drawable chart.
 */
export function leadChart(pub: PublicStory, t: (s: string) => string): LeadChart | null {
  const s = pub.story;
  const charts = s.data.charts as Record<string, ChartData | undefined>;
  for (const ref of [...s.macro.charts, ...s.analytics.charts]) {
    const c = charts[ref.chartId];
    const series = (c?.series ?? []).filter((x) => x.points?.length >= 2).slice(0, 2);
    if (!c || !series.length) continue;
    const all = series.flatMap((x) => x.points);
    const dates = all.map((p) => p.date).sort();
    const providers = [...new Set((c.sources ?? []).map((src) => src.short ?? 'FRED'))];
    return {
      question: t(ref.question),
      series: series.map((x) => ({ label: x.label, points: thin(x.points) })),
      unit: c.unit ? { prefix: c.unit.prefix, suffix: c.unit.suffix } : { prefix: '', suffix: '%' },
      first: dates[0],
      last: dates[dates.length - 1],
      source: providers.length ? `Source: ${providers.join(', ')}` : '',
    };
  }
  return null;
}

/**
 * Public card model for one live story, with fact tokens resolved against
 * the story's own data. Returns null (and the card is skipped) if the copy
 * cannot be resolved — the article page would fail on it too.
 */
export function toCard(pub: PublicStory, withArtwork = false): StoryCardModel | null {
  const { story, meta, data } = pub.story;
  const ctx: TokenContext = { facts: data.facts as Record<string, Fact>, dates: data.dates as Record<string, DateFact> };
  const t = (s: string) => resolveTokens(s, ctx);
  try {
    const date = pub.firstPublishedAt.slice(0, 10);
    const latest = pub.publishedAt.slice(0, 10);
    return {
      id: pub.id,
      href: `/story/${pub.slug}`,
      section: meta.section,
      headline: t(story.headline),
      dek: t(story.dek),
      author: meta.author,
      date,
      ...(latest !== date ? { updated: latest } : {}),
      artwork: withArtwork ? leadChart(pub, t) : null,
    };
  } catch (e) {
    console.error(`[home] card for ${pub.slug} skipped: ${(e as Error).message}`);
    return null;
  }
}
