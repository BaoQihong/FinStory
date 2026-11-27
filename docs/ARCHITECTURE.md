# Architecture

> **Status: Phase 2A prototype architecture.** Describes what is built.
> Production architecture (database schema, APIs, data pipelines, LLM
> integration) remains a Phase 3 decision.

## Stack

Next.js 16 App Router (Turbopack, Cache Components), React 19, TypeScript 5,
Tailwind CSS 4, Recharts 3. Node 22.x. Hosted on Vercel via Git integration
(`main` → production). See D-013–D-015.

Every route is statically prerendered at build time. There are no API
routes, no environment variables in use by the app, and no runtime calls to
Supabase or Arli AI in Phase 2A.

## Layout

```
app/                     routes: / · /stories/[slug] · /section/[section] · /about · 404
components/
  site/                  header, footer, nav, Seshat mark
  editorial/             story cards, chapter nav, evidence tags, hero pattern
  article/               ArticleView (five layers), asset icons
  charts/                TimeSeriesChart (client), ChartFigure, IndicatorCard, Sparkline, YieldSplit
  home/                  LeadVisual
content/                 editorial content (TypeScript), index of sections/articles
lib/
  data/                  types.ts (SeriesFixture, DisplaySeries), display.ts (Fact, ChartData…), transforms.ts
  content/               article model (types.ts), fact tokens, reading time
  stories/bond-comeback/ build.ts (pure: fixtures → facts, indicators, charts) · index.ts (server-only loader)
data/fred/               version-controlled FRED fixtures (one JSON per series)
scripts/data/            fetch-fred.mjs · validate-fixtures.ts · transforms.test.ts
```

## Data flow

```
FRED CSV ──fetch-fred.mjs──▶ data/fred/<ID>.json  (SeriesFixture: source, units, frequency,
                                                   retrievedAt, sha256, observations[null=missing])
                                   │
                    lib/stories/bond-comeback/build.ts   (pure; also run by validate-fixtures.ts)
                                   │
             facts / dates / indicators / charts / split
                                   │
 content/articles/*.ts ──fact tokens {y10Peak}──▶ lib/content/tokens.ts ──▶ rendered copy
                                   │
     Server Components render text, cards, tables; only the chart points
     needed for drawing are passed to the client TimeSeriesChart.
```

## Content model (Phase 3 mapping)

`lib/content/types.ts` defines `PublishedArticle` (metadata, key points,
narrative blocks, macro indicators + chart blocks + explainers, analytics
split / chain / chart / implications, outlook scenarios, methodology,
citations) and `PreviewArticle`. These map naturally onto future tables
(`articles`, `article_blocks`, `scenarios`, `citations`, `series`,
`observations`); fact tokens become references to stored derived values.

## Phase 3 replacement points

- `scripts/data/fetch-fred.mjs` → scheduled retrieval writing the same
  `SeriesFixture` shape to Supabase.
- `content/` → database-backed content with an editorial CMS.
- `lib/stories/<story>/build.ts` → per-story derivations computed at
  publish time and stored with the article.

---

# Phase 2B — editorial research & generation engine

> Status: built in Phase 2B (D-023–D-032). Public publishing is Phase 2C.

## Flow

```
Editor (/admin/new) ── brief ──▶ articles(status=generating) + generation_jobs(queued)
                                      │
 /admin/drafts/[id]  ◀─ GenerationPanel loops POST /api/studio/jobs/[id]/step ─┐
                                      │  (one stage per call, DB lease, ≤ 290 s) │
   plan        LLM  research plan: questions, searches, data needs             │
   search      app  Tavily search ×≤6 + extract top sources → research_sources │
   discover    app  FRED series/search + curated registry + Tiingo/EIA meta    │
   select      LLM  pick datasets ONLY from provider-verified candidates (C1…) │
   fetch       app  observations → datasets; facts/indicators/charts (facts.ts)│
   synthesize  LLM  evidence package; app verifies quotes verbatim → findings  │
   story       LLM  THE STORY            (fact tokens only)                    │
   macro_analytics LLM MACRO + ANALYTICS (charts/indicators by id)             │
   outlook     LLM  OUTLOOK (conditional scenarios, fixed disclaimer)          │
   repair      LLM  rewrite only strings the validator flagged                 │
   assemble    app  SeshatArticleV1 + validation + recomputation → articles,   │
                    article_revisions (rev 1, origin=generated)  ──────────────┘
                                      │
 Editor edits (saveDraft → validate → revision n+1, origin=editor)
 Preview /admin/drafts/[id]/preview → fromDraft() → ArticleView mode="preview"
```

## Modules

```
lib/studio/
  schema.ts        SeshatArticleV1 (zod, strict, four sections) + StoryBrief
  units.ts         unit classification (rate / index / level) — decides transforms & display
  facts.ts         derived series (difference, yoy), facts, indicator cards, chart data
  numbers.ts       fact-token checks + untokenised-number scanner
  validate.ts      article validation + attention folding
  sources.ts       authority classification, staleness, verbatim quote checks
  registry.ts      curated indicator hints (FRED / Tiingo / EIA)
  llm.ts           Arli client (json_schema, zod validation, repair round, serialised)
  providers/       http (timeouts/retries, key-safe errors), tavily, fred, tiingo, eia
  pipeline/        types (Store, Deps, stages), prompts, stages, runner, memory-store
  supabase-store.ts  Store over the editor's RLS-bound Supabase session
  deps.ts / auth.ts / job-view.ts   server wiring, requireEditor(), UI job shape
lib/content/render-model.ts   one render model for published + draft articles
app/admin/…                   studio pages + server actions; app/api/studio/jobs/[id]/step
components/studio/…           forms, generation panel, section editors, research/data/checks
proxy.ts                      session refresh + optimistic redirect for /admin, /api/studio
supabase/migrations/20261126120000_phase2b_editorial_studio.sql
```

## Database (Supabase, RLS = `is_editor()` on every table)

| Table | Purpose |
|-------|---------|
| `editors` | allow-list of editor user ids (MVP: one) |
| `articles` | draft: brief, status, canonical content (JSONB), revision, as-of date |
| `article_revisions` | every generated / edited version (origin `generated` / `editor`) |
| `generation_jobs` | status, next stage, lease, attempts, error, warnings, metrics; unique index → one active job |
| `job_stage_runs` | each stage attempt with its persisted output and metrics (resume point) |
| `research_sources` | S-refs: URL, title, publisher, type, date, stale flag, query, snippet, excerpt (internal) |
| `research_findings` | F-refs: claim, evidence kind, source refs, quote, verbatim-verified flag |
| `datasets` | provenance (provider, id, units, frequency, definition, URL, retrieval time, sha256, transformations) + raw observations |

`claim_generation_job(job, seconds)` (SECURITY INVOKER) takes the lease atomically.

## Separation of responsibilities

- **LLM**: planning, relevance, selection among verified candidates, synthesis, prose, interpretation, scenarios.
- **Application**: every HTTP call, search, retrieval, unit handling, calculation, citation/URL handling, schema validation, persistence, orchestration, authorisation.
