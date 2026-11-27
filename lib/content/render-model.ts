// One render model for every Seshat article: THE STORY → MACRO → ANALYTICS → OUTLOOK.
// The published Phase 2A article (TypeScript content + story data module) and
// Phase 2B generated drafts (SeshatArticleV1 JSON) both map onto it, so the
// approved ArticleView renders either without story-specific layouts.
import type { SourceRef } from '../data/types.ts';
import type { ChartData, DateFact, Fact, IndicatorCard } from '../data/display.ts';
import type { AssetImplication, ChainStep, ChartBlock, Citation, Evidence, Explainer, IndicatorNote, ProseBlock, PublishedArticle, Scenario, SectionKey } from './types.ts';
import type { BondComebackData } from '../stories/bond-comeback/build.ts';
import type { SeshatArticle } from '../studio/schema.ts';

type ChartRef = Omit<ChartBlock, 'type'>;
type Attention = { required: boolean; reasons: string[] };

export type RenderScenario = Scenario & { role?: 'central' | 'alternative'; uncertainties?: string[] };
export type RenderImplication = Omit<AssetImplication, 'icon'> & { icon: AssetImplication['icon'] | 'currency' | 'commodities' };

export type RenderArticle = {
  section: SectionKey;
  headline: string;
  dek: string;
  byline: { name: string; role: string };
  /** Date shown in the header: publication date, or last-saved date for drafts. */
  date: string;
  dataCutoff: string;
  keyPoints: string[];
  story: { id: 'story'; label: string; title: string; blocks: ProseBlock[]; attention?: Attention };
  macro: { id: 'macro'; label: string; title: string; intro: string; indicators: IndicatorNote[]; charts: ChartRef[]; explainers: Explainer[]; attention?: Attention };
  analytics: {
    id: 'analytics';
    label: string;
    title: string;
    intro: string;
    chain: { title: string; steps: ChainStep[] };
    /** Phase 2A-only comparison graphic (real yield + breakeven split). */
    split?: { question: string; takeaway: string; note: string };
    charts: ChartRef[];
    comparisons: Explainer[];
    implications: { title: string; intro: string; items: RenderImplication[] };
    attention?: Attention;
  };
  outlook: { id: 'outlook'; label: string; title: string; intro: string; disclaimer: string; scenarios: RenderScenario[]; attention?: Attention };
  methodology: string[];
  /** Research sources (web documents) — datasets are listed from RenderData.sources. */
  citations: (Citation & { publisher?: string; publishedAt?: string | null })[];
  footerNote: string;
};

export type SplitRow = { label: string; sub: string; nominal: number; real: number; breakeven: number };

export type RenderData = {
  facts: Record<string, Fact>;
  dates: Record<string, DateFact>;
  charts: Record<string, ChartData>;
  indicators: IndicatorCard[];
  sources: SourceRef[];
  split?: SplitRow[];
};

const PROTOTYPE_NOTE =
  'Prototype edition: this demonstration article is a draft awaiting editorial review. It is general information and education, not investment advice. Past movements in yields do not predict future ones.';

/** Phase 2A published article → render model (output identical to the approved page). */
export function fromPublished(a: PublishedArticle, data: BondComebackData): { article: RenderArticle; data: RenderData } {
  return {
    article: {
      section: a.section,
      headline: a.headline,
      dek: a.dek,
      byline: a.byline,
      date: a.publishedAt,
      dataCutoff: a.dataCutoff,
      keyPoints: a.keyPoints,
      story: { id: 'story', label: a.narrative.label, title: a.narrative.title, blocks: a.narrative.blocks },
      macro: { ...a.macro },
      analytics: {
        id: 'analytics',
        label: a.analytics.label,
        title: a.analytics.title,
        intro: a.analytics.intro,
        chain: a.analytics.chain,
        split: a.analytics.split,
        charts: [a.analytics.chart],
        comparisons: [],
        implications: a.analytics.implications,
      },
      outlook: { ...a.outlook },
      methodology: a.methodology,
      citations: a.citations,
      footerNote: PROTOTYPE_NOTE,
    },
    data: {
      facts: data.facts as Record<string, Fact>,
      dates: data.dates as Record<string, DateFact>,
      charts: data.charts as Record<string, ChartData>,
      indicators: data.indicators,
      sources: data.sources,
      split: data.split,
    },
  };
}

const LABELS = { story: 'The Story', macro: 'Macro', analytics: 'Analytics', outlook: 'Outlook' } as const;

/** Generated / edited draft (SeshatArticleV1) → render model. */
export function fromDraft(c: SeshatArticle): { article: RenderArticle; data: RenderData } {
  return {
    article: {
      section: c.meta.section,
      headline: c.story.headline,
      dek: c.story.dek,
      byline: c.meta.author,
      date: c.meta.updatedAt.slice(0, 10),
      dataCutoff: c.meta.asOf,
      keyPoints: c.story.keyPoints,
      story: { id: 'story', label: LABELS.story, title: c.story.headline, blocks: c.story.blocks, attention: c.story.attention },
      macro: { id: 'macro', label: LABELS.macro, ...c.macro },
      analytics: { id: 'analytics', label: LABELS.analytics, ...c.analytics, charts: c.analytics.charts, comparisons: c.analytics.comparisons },
      outlook: { id: 'outlook', label: LABELS.outlook, ...c.outlook },
      methodology: c.methodology,
      citations: c.evidence.citations.map((x) => ({ label: x.title, url: x.url, note: x.ref, publisher: x.publisher, publishedAt: x.publishedAt })),
      footerNote:
        'Draft preview — not published. Generated with AI assistance from the sources and data listed above, for review and editing by a human editor. General information and education, not investment advice.',
    },
    data: {
      facts: c.data.facts as Record<string, Fact>,
      dates: c.data.dates as Record<string, DateFact>,
      charts: c.data.charts as Record<string, ChartData>,
      indicators: c.data.indicators as IndicatorCard[],
      sources: c.data.sources as SourceRef[],
    },
  };
}

/** Reading time: ≈220 wpm over the copy, plus ¾ minute per chart. */
export function readingMinutesOf(a: RenderArticle, resolve: (s: string) => string): number {
  const texts: string[] = [...a.keyPoints];
  for (const b of a.story.blocks) if (b.type !== 'chart') texts.push(b.text);
  texts.push(a.macro.intro, ...a.macro.explainers.map((e) => e.text));
  texts.push(a.analytics.intro, ...a.analytics.chain.steps.map((s) => s.text), ...a.analytics.comparisons.map((e) => e.text));
  texts.push(...a.analytics.implications.items.flatMap((i) => [i.shows, i.couldMean]));
  texts.push(a.outlook.intro, ...a.outlook.scenarios.flatMap((s) => [s.summary, s.whyItMatters, ...s.conditions]));
  const words = texts.map(resolve).join(' ').split(/\s+/).filter(Boolean).length;
  // Same rule as Phase 2A (lib/content/reading-time.ts): macro + analytics graphics.
  const charts = a.macro.charts.length + a.analytics.charts.length + (a.analytics.split ? 1 : 0);
  return Math.max(1, Math.round(words / 220 + charts * 0.75));
}

export type { Evidence };
