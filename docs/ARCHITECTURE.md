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

# Phase 3A — publishing engine

Publishing is always an explicit editor action in the studio. No pipeline
stage, job or script publishes or alters a live story (D-043).

## Publication lifecycle

```
never ──Publish──▶ live ──edit / regenerate──▶ live_changed ──Republish──▶ live
                    │                             │
                    └────────── Unpublish ────────┴──▶ unpublished ──Republish──▶ live
```

There is no stored state machine. The four states the studio shows are
derived from the publication columns on `articles`
(`lib/publishing/rules.ts` → `publicationState`):

| State | Condition | Studio label |
|-------|-----------|--------------|
| `never` | `first_published_at is null` | Not published |
| `live` | `is_live and published_source_revision = revision` | Published |
| `live_changed` | `is_live and published_source_revision <> revision` | Published · unpublished changes |
| `unpublished` | `not is_live and first_published_at is not null` | Unpublished |

Any save or generation bumps `articles.revision`. That is what "unpublished
changes" means, and it never touches the live snapshot.

## Schema (migration `20261127150000_publishing_engine.sql`, additive)

- **`articles`** (new columns) — `slug` (unique, `^[a-z0-9]+(-[a-z0-9]+)*$`,
  3–80 chars, permanent once set), `is_live`, `first_published_at`,
  `last_published_at`, `unpublished_at`, `published_revision` (publication
  number, 0 = never), `published_source_revision` (the working-draft
  revision that is or was live). The stable internal identifier remains
  `articles.id`.
- **`publication_revisions`** — immutable history: `article_id`,
  `revision` (publication number, unique per article), `source_revision`,
  `slug`, `content` (the full internal draft at that revision), `snapshot`
  (the public projection exactly as served), `note`, `published_by`,
  `published_by_name`, `published_at`. The FK is `on delete restrict`, so
  an article that was ever published cannot be deleted.
- **`published_stories`** — one row per *live* article: `article_id`
  (PK), `slug` (unique), `revision`, `snapshot`, `first_published_at`,
  `published_at`. Unpublishing deletes the row; the history stays.
- **`publish_article(article, expected_revision, slug, snapshot, note)`** and
  **`unpublish_article(article)`** — `SECURITY DEFINER`, `search_path = ''`,
  an explicit `is_editor()` check, executable by `authenticated` only. Each
  is one transaction with `SELECT … FOR UPDATE` on the article row. Publish
  refuses with a stable code prefix (`stale_revision`, `generation_running`,
  `temporary_draft`, `no_content`, `slug_taken`, `slug_mismatch`,
  `slug_required`, `invalid_snapshot`, `not_authorised`). A request for a
  revision that is already live returns `unchanged`, and so does
  unpublishing a story that is not live. Duplicate or concurrent requests
  therefore produce exactly one publication.
- **Trigger `articles_zz_guard_publication`** — rejects any insert or update
  of the publication columns outside the two functions (they set the
  transaction-local flag `seshat.publishing`), makes the slug immutable, and
  keeps `updated_at` unchanged on publish and unpublish.

## Snapshot model — `PublishedStoryV1` (`lib/publishing/snapshot.ts`)

`toPublicSnapshot()` projects the snapshot from the validated working
draft, and it is stored twice (history and live). It is a deep copy.
Nothing is re-researched, regenerated or re-fetched: the data products
already in the draft are copied as they are.

| Kept (public) | Dropped (internal) |
|---------------|--------------------|
| `meta.section`, `meta.author`, `meta.asOf` | `meta.workingTitle`, `createdAt`, `updatedAt` |
| `story`, `macro`, `analytics`, `outlook` (all copy, chart references, explainers, chain, implications, scenarios, disclaimer) | each section's `attention` (editor notes) |
| `methodology` | `evidence.findings` (claims, quotes), `evidence.gaps` |
| `citations` (= `evidence.citations`) | `validation` (issues, claims ledger) |
| `data` (facts, dates, charts, indicators, dataset sources with retrieval timestamps) | `generation` (job id, model, providers) |

The brief, research sources and excerpts, stage outputs, raw dataset
observations and editor notes live in other tables and are never copied.

## Pre-publication validation (`checkPublication`)

The server re-reads the draft from the database and never trusts content
from the browser. It runs the same checks as every save (`SeshatArticleV1`
and `validateArticle`).

- **Blocking:** no content; a schema violation; any validation *error*
  (unknown fact token, chart or indicator; contradicted superlative;
  quantity error; missing source…); any section still flagged *needs
  attention* (the editor resolves it and clears the flag); a temporary
  draft; a running generation; a stale revision; an invalid, reserved or
  taken slug.
- **Warnings (shown, not blocking):** validation warnings (bare numbers,
  unsupported superlatives, thin story, few scenarios, stale data…),
  Tiingo-sourced data (licence review pending, P2B-16), no citations.

## Security and access control

| Role | `articles` and Phase 2B tables | `publication_revisions` | `published_stories` | publish / unpublish |
|------|------------------------------|-------------------------|---------------------|-------------------|
| anon (public) | none | none | `SELECT` (only live rows exist) | no execute |
| authenticated non-editor | RLS denies | RLS denies | `SELECT` | can execute, but `is_editor()` raises `not_authorised` |
| editor | RLS `is_editor()` (publication columns guarded by the trigger) | `SELECT` only | `SELECT` only | yes |

No role can write the history or live tables directly. The app still uses
only the publishable key and the editor's session (D-029). The secret key
is used only by the local integration script, to delete its fixtures.

## Phase 3B data-access contract

`lib/publishing/public.ts` (server-only, cookie-less anon client):

- `getPublishedStory(slug): Promise<PublicStory | null>`. Returns null for
  unknown, unpublished or schema-invalid snapshots.
- `listPublishedStories(limit = 50): Promise<PublicStory[]>`. Most recently
  published first.
- `PublicStory = { id, slug, revision, firstPublishedAt, publishedAt, story: PublishedStoryV1 }`.

The public route is `/story/[slug]`. The Phase 2A demonstration stays at
`/stories/[slug]`, and its slugs are reserved. The 3B renderer maps
`PublishedStoryV1` onto the existing render model. Its sections are
`SeshatArticleV1`'s section shapes without `attention`, so a
`fromSnapshot()` sibling of `fromDraft()` is a thin adapter. Use
`firstPublishedAt` and `publishedAt` for the header dates, plus a public
footer note. Until 3B ships, the studio shows the permanent URL with a
copy button but no "Open" link (`PUBLIC_ROUTE_LIVE = false` in
`components/studio/PublishPanel.tsx`).

## Studio interface

- **Publication panel** on the draft page: the state, publication number
  and source revision, first, latest and unpublished timestamps, an
  unpublished-changes notice, the permanent URL with a copy button, and the
  Publish… / Republish… / Unpublish… buttons. These are disabled while
  there are unsaved edits or a generation is running.
- **Confirmation dialog:** fetches a fresh preflight and shows the
  headline, "draft revision N becomes publication M", the slug (editable
  only before the first publication), blocking errors, warnings and an
  optional note. The submit button locks while a request is pending; a ref
  guard stops double submits, and the database is idempotent anyway.
- The drafts list and the draft header show a publication badge. The
  History tab lists every publication, and the preview banner says whether
  the preview matches the live publication.

## Limitations and deferred work

- There is no public renderer yet (3B). Live snapshots exist in the
  database but have no page.
- There is no revision comparison or rollback UI. The history is stored
  for it.
- There is one editor today. `published_by_name` comes from
  `editors.display_name`; multi-editor roles and approvals are not modelled.
- Published articles cannot be deleted (FK restrict). A "retract and
  delete" operation would need its own decision.
- The snapshot is re-validated when read; a future schema change needs a
  `schemaVersion` 2 reader.
