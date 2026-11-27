// Canonical Seshat article schema, version 1.
//
//   THE STORY → MACRO → ANALYTICS → OUTLOOK
//
// Exactly four top-level sections, always in this order, always present.
// Headline, summary (dek), byline and dates belong to The Story. The LLM
// never produces markup — only the structured fields below — and every
// number in copy is a fact token ({key}) resolved against `data.facts`.
//
// This schema validates both generated drafts and editor saves. Changing it
// requires bumping SCHEMA_VERSION and writing a migration for stored drafts.
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
export const SECTION_ORDER = ['story', 'macro', 'analytics', 'outlook'] as const;
export type SectionId = (typeof SECTION_ORDER)[number];
export const SECTION_LABELS: Record<SectionId, string> = {
  story: 'The Story',
  macro: 'Macro',
  analytics: 'Analytics',
  outlook: 'Outlook',
};

const text = (max: number) => z.string().trim().min(1).max(max);

export const EvidenceKind = z.enum(['documented', 'context', 'interpretation']);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

/** Set when a section lacks sufficient support. The section is kept, never padded. */
export const Attention = z.object({
  required: z.boolean(),
  reasons: z.array(text(400)).max(10),
});
export type Attention = z.infer<typeof Attention>;
export const noAttention = (): Attention => ({ required: false, reasons: [] });

export const ChartRef = z.object({
  chartId: text(64),
  question: text(200),
  takeaway: text(400),
});
export type ChartRef = z.infer<typeof ChartRef>;

export const ProseBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text: text(1600) }),
  z.object({ type: z.literal('h3'), text: text(160) }),
  z.object({ type: z.literal('pullquote'), text: text(300) }),
  z.object({ type: z.literal('chart'), chartId: text(64), question: text(200), takeaway: text(400) }),
]);
export type ProseBlock = z.infer<typeof ProseBlock>;

export const Explainer = z.object({ title: text(160), text: text(800), evidence: EvidenceKind });
export type Explainer = z.infer<typeof Explainer>;

export const AssetIconKind = z.enum(['bonds', 'cash', 'stocks', 'property', 'currency', 'commodities']);
export type AssetIconKind = z.infer<typeof AssetIconKind>;

export const AssetImplication = z.object({
  asset: text(60),
  icon: AssetIconKind,
  shows: text(600),
  showsEvidence: EvidenceKind,
  couldMean: text(600),
});

export const Scenario = z.object({
  key: text(40),
  name: text(80),
  /** "central" marks the scenario the evidence currently leans towards; never a probability. */
  role: z.enum(['central', 'alternative']),
  summary: text(500),
  conditions: z.array(text(300)).min(1).max(6),
  whyItMatters: text(600),
  assets: z.array(z.object({ asset: text(60), effect: text(300) })).min(1).max(6),
  watch: z.array(text(200)).min(1).max(6),
  uncertainties: z.array(text(300)).min(1).max(5),
});
export type Scenario = z.infer<typeof Scenario>;

export const StorySection = z.object({
  kicker: text(40),
  headline: text(140),
  dek: text(400),
  keyPoints: z.array(text(400)).min(1).max(4),
  blocks: z.array(ProseBlock).min(1).max(40),
  attention: Attention,
});

export const MacroSection = z.object({
  title: text(140),
  intro: text(800),
  indicators: z.array(z.object({ key: text(64), note: text(300) })).max(4),
  charts: z.array(ChartRef).max(4),
  explainers: z.array(Explainer).max(6),
  attention: Attention,
});

export const AnalyticsSection = z.object({
  title: text(140),
  intro: text(800),
  chain: z.object({
    title: text(140),
    steps: z.array(z.object({ title: text(120), text: text(600), evidence: EvidenceKind })).min(2).max(6),
  }),
  charts: z.array(ChartRef).max(3),
  /** Historical comparisons and other supporting context. */
  comparisons: z.array(Explainer).max(4),
  implications: z.object({
    title: text(140),
    intro: text(500),
    items: z.array(AssetImplication).max(6),
  }),
  attention: Attention,
});

export const OutlookSection = z.object({
  title: text(140),
  intro: text(800),
  disclaimer: text(500),
  scenarios: z.array(Scenario).max(4),
  attention: Attention,
});

// ── Data bound to the article (computed by application code, never by the LLM) ──

const FactSchema = z.object({
  value: z.number(),
  format: z.enum(['pct', 'pp', 'num', 'level', 'text']),
  decimals: z.number().int().min(0).max(6),
  unit: z.object({ prefix: z.string().max(8), suffix: z.string().max(60) }).optional(),
  /** For 'text' facts (figures quoted from a source document): the exact display string. */
  text: z.string().max(120).optional(),
  date: z.string().optional(),
  datePrecision: z.enum(['day', 'month', 'quarter', 'year']).optional(),
  seriesIds: z.array(z.string()),
  sourceRefs: z.array(z.string()).optional(),
  method: z.string().max(600),
  /** What the number is (see lib/studio/quantity.ts) — used to check every claim that cites it. */
  quantity: z
    .object({
      kind: z.enum(['level', 'change', 'rate']),
      window: z.enum(['1y', '5y', 'other']).optional(),
      unit: z.string().max(80),
      denominator: z.string().max(40).optional(),
      measure: z.enum(['stock', 'flow', 'price', 'rate', 'index', 'ratio', 'count', 'other']),
      temporal: z.enum(['historical', 'forecast', 'estimate', 'target']),
      period: z.string().max(40).optional(),
    })
    .optional(),
  quantityNotes: z.array(z.string().max(200)).max(6).optional(),
});
export const ClaimRecordSchema = z.object({
  path: z.string(),
  sentence: z.string(),
  tokens: z.array(z.string()),
  status: z.enum(['ok', 'flagged']),
  issues: z.array(z.object({ code: z.string(), message: z.string(), severity: z.enum(['error', 'warning']) })),
});
const DateFactSchema = z.object({
  date: z.string(),
  datePrecision: z.enum(['day', 'month', 'quarter', 'year']),
  seriesIds: z.array(z.string()),
  method: z.string(),
});

export const Citation = z.object({
  ref: text(8),
  title: text(300),
  url: z.url(),
  publisher: text(120),
  sourceType: z.enum(['primary', 'journalism', 'other']),
  publishedAt: z.string().nullable(),
});
export type Citation = z.infer<typeof Citation>;

export const ValidationIssue = z.object({
  level: z.enum(['error', 'warning', 'info']),
  section: z.enum([...SECTION_ORDER, 'evidence', 'data']),
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

// strictObject: an extra (fifth) top-level section is a schema error, not silently dropped.
export const SeshatArticleV1 = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  meta: z.object({
    workingTitle: text(200),
    section: z.enum(['markets', 'economy', 'technology', 'wealth']),
    author: z.object({ name: text(80), role: text(80) }),
    asOf: z.string(), // ISO date: latest observation / research cutoff
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  story: StorySection,
  macro: MacroSection,
  analytics: AnalyticsSection,
  outlook: OutlookSection,
  methodology: z.array(text(600)).max(12),
  evidence: z.object({
    citations: z.array(Citation),
    /** Evidence the research needed but could not obtain (never filled with substitutes). */
    gaps: z
      .array(z.object({ need: z.string().max(300), reason: z.enum(['provider-unavailable', 'no-dataset', 'stale-data']), provider: z.string().max(80).optional(), detail: z.string().max(300).optional() }))
      .optional(),
    findings: z.array(
      z.object({ ref: z.string(), claim: z.string(), kind: EvidenceKind, sourceRefs: z.array(z.string()), quoteVerified: z.boolean() }),
    ),
  }),
  /** Deterministic data products. `charts` / `indicators` / `sources` follow lib/data/display shapes. */
  data: z.object({
    facts: z.record(z.string(), FactSchema),
    dates: z.record(z.string(), DateFactSchema),
    charts: z.record(z.string(), z.any()),
    indicators: z.array(z.any()),
    sources: z.array(z.any()),
  }),
  validation: z.object({
    checkedAt: z.string(),
    issues: z.array(ValidationIssue),
    /** Every figure-bearing sentence and the result of its quantity checks. */
    claims: z.array(ClaimRecordSchema).optional(),
  }),
  generation: z.object({
    jobId: z.string(),
    model: z.string(),
    searchProvider: z.string(),
    dataProviders: z.array(z.string()),
    generatedAt: z.string(),
  }),
});
export type SeshatArticle = z.infer<typeof SeshatArticleV1>;

// ── The editor's brief ──────────────────────────────────────────────────────
export const StoryBrief = z.object({
  prompt: z.string().trim().min(20, 'Describe the story in at least a sentence (20+ characters).').max(4000),
  headline: z.string().trim().max(200).optional(),
  audience: z.string().trim().max(300).optional(),
  angle: z.string().trim().max(600).optional(),
  questions: z.string().trim().max(1500).optional(),
  assets: z.string().trim().max(600).optional(),
  instructions: z.string().trim().max(1500).optional(),
});
export type StoryBrief = z.infer<typeof StoryBrief>;
