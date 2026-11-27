// Public snapshot contract — PublishedStoryV1.
//
// The snapshot is what readers get: a stable, self-contained copy of an
// approved working draft at publication time. It carries everything the
// article renderer needs (copy, byline, the four sections, methodology,
// citations and the computed data products: facts, dates, charts,
// indicators, dataset sources) and nothing internal: no brief, research
// findings or quotes, validation ledger, attention notes, evidence gaps, job
// id or model name.
//
// Stored in publication_revisions.snapshot (history) and
// published_stories.snapshot (live). Phase 3B renders it; changing its shape
// requires a new schemaVersion and a reader for the old one.
import { z } from 'zod';
import { AnalyticsSection, Citation, MacroSection, OutlookSection, SeshatArticleV1, StorySection, type SeshatArticle } from '../studio/schema.ts';

export const SNAPSHOT_VERSION = 1 as const;

const noAttention = { attention: true } as const;

export const PublishedStoryV1 = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_VERSION),
  meta: z.object({
    section: SeshatArticleV1.shape.meta.shape.section,
    author: SeshatArticleV1.shape.meta.shape.author,
    /** Latest observation / research cutoff of the data in the article. */
    asOf: z.string(),
  }),
  story: StorySection.omit(noAttention),
  macro: MacroSection.omit(noAttention),
  analytics: AnalyticsSection.omit(noAttention),
  outlook: OutlookSection.omit(noAttention),
  methodology: SeshatArticleV1.shape.methodology,
  citations: z.array(Citation),
  data: SeshatArticleV1.shape.data,
});
export type PublishedStory = z.infer<typeof PublishedStoryV1>;

/** Public projection of a validated working draft. Pure; never mutates the draft. */
export function toPublicSnapshot(a: SeshatArticle): PublishedStory {
  const strip = <T extends { attention: unknown }>(s: T): Omit<T, 'attention'> => {
    const { attention: _ignored, ...rest } = s;
    void _ignored;
    return rest;
  };
  return PublishedStoryV1.parse(
    structuredClone({
      schemaVersion: SNAPSHOT_VERSION,
      meta: { section: a.meta.section, author: a.meta.author, asOf: a.meta.asOf },
      story: strip(a.story),
      macro: strip(a.macro),
      analytics: strip(a.analytics),
      outlook: strip(a.outlook),
      methodology: a.methodology,
      citations: a.evidence.citations,
      data: a.data,
    }),
  );
}

/** One live published story as returned by the public data interface (Phase 3B contract). */
export type PublicStory = {
  /** Stable internal identifier (articles.id). */
  id: string;
  slug: string;
  /** Publication number: 1 for the first publication, +1 per republish. */
  revision: number;
  firstPublishedAt: string;
  publishedAt: string;
  story: PublishedStory;
};
