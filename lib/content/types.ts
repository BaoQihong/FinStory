// Structured article model. Designed to map onto database rows in Phase 3
// (articles, article_blocks, scenarios, citations) — for Phase 2A it is
// authored as local TypeScript content in content/.
//
// Text fields may contain fact tokens, e.g. "{y10Peak}" or "{y10Peak.date}",
// which are resolved against the story's data module at render time. This
// keeps every number in the copy tied to an observation (see lib/content/tokens.ts).

export type SectionKey = 'markets' | 'economy' | 'technology' | 'wealth';

export type Section = {
  key: SectionKey;
  name: string;
  description: string;
};

export type Byline = { name: string; role: string };

/** How strongly a statement is evidenced. Shown to readers as a tag. */
export type Evidence =
  | 'documented' // directly visible in the data used in this article
  | 'context' // well-established relationship, not measured in this article
  | 'interpretation'; // Seshat's editorial reading

export type ChartBlock = {
  type: 'chart';
  chartId: string;
  question: string;
  takeaway: string;
};

export type ProseBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'pullquote'; text: string }
  | ChartBlock;

export type IndicatorNote = { key: string; note: string };

export type Explainer = { title: string; text: string; evidence: Evidence };

export type ChainStep = { title: string; text: string; evidence: Evidence };

export type AssetImplication = {
  asset: string;
  icon: 'bonds' | 'cash' | 'stocks' | 'property';
  shows: string;
  showsEvidence: Evidence;
  couldMean: string;
};

export type Scenario = {
  key: string;
  name: string;
  summary: string;
  conditions: string[];
  whyItMatters: string;
  assets: { asset: string; effect: string }[];
  watch: string[];
};

export type Citation = { label: string; url: string; note?: string };

type ArticleBase = {
  slug: string;
  section: SectionKey;
  kicker: string;
  headline: string;
  /** Short headline for cards and navigation. */
  shortHeadline?: string;
  dek: string;
  byline: Byline;
  publishedAt: string; // ISO date
};

export type PublishedArticle = ArticleBase & {
  status: 'published';
  /** Story data module that resolves fact tokens and charts. */
  dataModule: 'bond-comeback';
  dataCutoff: string; // ISO date of latest observation used
  /** Layer 1 — the story in 30 seconds. */
  keyPoints: string[];
  /** Layer 2 — narrative. */
  narrative: { id: 'story'; label: string; title: string; blocks: ProseBlock[] };
  /** Layer 3 — macro evidence. */
  macro: {
    id: 'macro';
    label: string;
    title: string;
    intro: string;
    indicators: IndicatorNote[];
    charts: ChartBlock[];
    explainers: Explainer[];
  };
  /** Layer 4 — transmission and implications. */
  analytics: {
    id: 'analytics';
    label: string;
    title: string;
    intro: string;
    split: { question: string; takeaway: string; note: string };
    chain: { title: string; steps: ChainStep[] };
    chart: ChartBlock;
    implications: { title: string; intro: string; items: AssetImplication[] };
  };
  /** Layer 5 — conditional outlook. */
  outlook: {
    id: 'outlook';
    label: string;
    title: string;
    intro: string;
    disclaimer: string;
    scenarios: Scenario[];
  };
  methodology: string[];
  citations: Citation[];
};

export type PreviewArticle = ArticleBase & {
  status: 'preview';
  /** What the finished piece will cover — framed as intent, not as reported fact. */
  plannedCoverage: string[];
};

export type Article = PublishedArticle | PreviewArticle;
