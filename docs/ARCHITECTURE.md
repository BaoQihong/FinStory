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
footer note. Since 3B.1 the studio shows the permanent URL with Copy and **View published article** (see below).

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

- ~~There is no public renderer yet (3B).~~ Shipped in 3B.1: see below.
- There is no revision comparison or rollback UI. The history is stored
  for it.
- There is one editor today. `published_by_name` comes from
  `editors.display_name`; multi-editor roles and approvals are not modelled.
- Published articles cannot be deleted (FK restrict). A "retract and
  delete" operation would need its own decision.
- The snapshot is re-validated when read; a future schema change needs a
  `schemaVersion` 2 reader.

# Phase 3B.1 — public article experience

## Request path

```
GET /story/<slug>
  │
  proxy.ts ── slug fails ^[a-z0-9]+(-[a-z0-9]+)*$ or > 80 chars ──────────▶ 404 (no-store)
  │          REST: published_stories?select=slug&slug=eq.<slug> (anon, 4 s)
  │            ├─ no row ───────────────────────────────────────────────▶ 404 (no-store)
  │            ├─ row    → continue
  │            └─ error  → continue (fail open: the page decides)
  ▼
app/story/[slug]/page.tsx   (instant = false; per request; no data cache)
  getPublishedStory(slug)   lib/publishing/public.ts: anon client, re-validates PublishedStoryV1
  → null: notFound()        (only reachable if the row vanished between proxy and page)
  → fromSnapshot(snapshot, {firstPublishedAt, publishedAt})
  → <ArticleView mode="public"/>      ← the same component the preview uses
```

- **Only the live snapshot is reachable.** The anon role can read `published_stories` and nothing else (D-044), so working drafts, history, briefs, findings and editor notes cannot be reached by URL. A draft's UUID, an unpublished slug or a deleted article all return 404 (tested).
- **Freshness and caching:** HTML is `private, no-cache, no-store`, and the data is read per request. Republishing replaces the row, so the next request shows the new content at the same URL. Unpublishing deletes the row, so the next request is a 404. Nothing has to be invalidated. The publish and unpublish actions also call `revalidatePath('/story/<slug>')`, ready for tag caching in Phase 3D (D-047).
- **Metadata:** `<title>` = headline, description = dek, canonical `/story/<slug>`, author. The 404 page gets `noindex`. Social cards and full SEO are deferred (3D).

## Shared renderer (WYSIWYG)

```
SeshatArticleV1 (working draft) ── fromDraft() ───┐
                                                  ├─ fromContent() ─▶ RenderArticle ─▶ ArticleView
PublishedStoryV1 (live snapshot) ─ fromSnapshot() ┘
```

`fromContent()` holds the single mapping. The only differences: the header date
(draft: last saved; public: first published, plus "Updated" after a
republication), the footer note (`DRAFT_FOOTER` / `PUBLIC_FOOTER`), and
attention notes, which only the preview shows. `ArticleView mode="public"`
also links the section badge and resolves tokens strictly. Publication blocks
unknown tokens, so preview and public output are identical for publishable
content. `scripts/publishing/publishing.test.ts` asserts that the two render
models are equal apart from those fields, and that `fromDraft()` is unchanged
from Phase 2B.

## Studio integration

- The publication panel shows the permanent URL with **Copy** and **View published article** (live states). Unpublished articles say readers get "page not found".
- The preview banner links to the live article when there is one, and still states whether the draft matches it.
- The Story tab has a **Byline** editor (D-050).

# Phase 3B.2 — editorial quality

## Generation prompts (D-048)

Each writing stage's prompt is built in this order:

```
EDITORIAL INTENT    idea · author's argument · angle · audience · headline · tone/voice   (briefBlock)
RESEARCH DIRECTION  questions · assets · indicators · outlook focus · premise · instructions
EDITORIAL CORE      thesis (built from the author's argument) · argument assessment · central question
EVIDENCE            support levels · gaps · findings
DATA                fact tokens · date tokens · deterministic observations · charts · indicator cards
ALREADY WRITTEN     macro_analytics: the full Story · outlook: Story/Macro/Analytics summaries + mechanism
STORYBOARD          the four section jobs
STYLE GUIDE         lib/editorial/style-guide.ts (versioned)
TASK + OUTPUT       section-specific instructions and JSON fields
```

The system prompt's factual rules (tokens only, no invented data, evidence
levels) are unchanged. The article schema is unchanged, and the brief gains two
optional fields.

## Editorial Polish (D-049)

```
Draft tab "Polish <Section>…" (saved revision N, not dirty, no job running)
  → proposePolish(article, N, section)            app/admin/polish-actions.ts
      reads draft + brief from DB (RLS) · rate limit · one Arli call (stage "polish")
      polishPrompt(): style guide + revision principles + intent + WHOLE article (read-only)
                      + token glossary + the section's whitelisted fields
      buildProposal(): drop unknown/duplicate/unchanged paths · checkRevision() per field
  ← proposal {baseRevision N, items[before, after, check], concerns}   (nothing written)
Editor reviews side by side, ticks fields (clean = pre-ticked, flagged = opt-in, rejected = locked)
  → applyPolish(article, N, section, accepted[path, before, after])
      revision still N? each field still == before? re-run checks (rejects blocked)
      applyRevisions() on a copy → saveDraft(N, content, note)  → revision N+1 (origin editor)
```

The pure module `lib/editorial/polish.ts` holds the whitelist, prompt, checks and
apply logic, and is unit-tested in `scripts/studio/polish.test.ts`. A Polish
request never writes the draft, and an accepted Polish never publishes: a live
article shows "unpublished changes" until the editor republishes.

## Fix It for Me (D-055)

```
Publish dialog → blocking issues panel → "Fix It for Me" (editor click; Publish disabled meanwhile)
  client loop, attempt = 1..3 (stops early: no blockers left · retry = false · error)
  → fixPublicationIssues(article, revision N, attempt, feedback)   app/admin/fix-actions.ts
      editor? revision still N? no generation job? daily limit (30) · Arli slot shared with Polish
      planFix()   lib/editorial/fix.ts: targets = text fields named by a BLOCKING validator error with a
                  wording code (isRepairableCode, same set as generation repair) + fields behind an
                  attention flag whose reasons are validator messages; everything else → "needs you"
      fixPrompt() repairPrompt() from lib/studio/repair.ts (shared with the generation repair stage)
                  + Fix It constraints, author intent, the job's stored data observations (no new
                  research or data fetch), each field's schema limit, the previous attempt's rejections
      one Arli call (stage "fix", RepairOut schema; malformed reply → error, draft unchanged)
      applyFix()  per rewrite: target path only · known tokens · no new typed numbers/years · quotes and
                  source refs unchanged · no verified figure dropped unless the problem is about it ·
                  within the schema limit → otherwise rejected, original kept; removed claims noted.
                  Attention: drop only validator-derived reasons the validator no longer reproduces.
      saveDraft(N, content, note, {revalidate: false}) → revision N+1 (origin editor; N kept)
  ← changes (before/after/notes), rejected, cleared, remaining blocking, manual, retry
  workspace adopts revision N+1 (dialog stays open) · after the loop: publicationPreflight() again
  closing the dialog → router.refresh() (History shows the new revisions)
```

It never publishes and never touches `published_stories` / `publication_revisions`;
publishing still needs its own click. Warnings (Tiingo licence, bare numbers, no
citations) are not targets and stay listed.

## Cost

| Operation | Calls | Typical tokens (Qwen3.8-27B, measured) |
|---|---|---|
| Generation (unchanged count) | 8 | The writing-stage prompts grow by about 1.5k tokens each (style guide) plus about 1–2k for earlier-section context |
| Editorial Polish, per section | 1 | ≈6–9.5k prompt + 0.6–1.1k completion tokens; 30–60 s typical |
| Fix It for Me, per attempt (≤3 per click) | 1 | ≈10–12k prompt + ≈100–150 completion tokens; 3–6 s (live check, 2026-11-28) |
| Evaluation script (manual) | ≈15 | Recorded as `api_usage.stage = 'evaluation'` |

# Phase 3C — editorial homepage

Seshat v0.1 (Editorial MVP): the homepage `/` is built only from the publishing engine's live content.

## Request path

```
GET /  (app/page.tsx, instant = false; per request; no data cache, as D-047)
  └─ getHomepage(page)               lib/publishing/public.ts, anon client (RLS)
       ├─ homepage_feature.article_id      (single row; anon may read id, article_id, updated_at only)
       ├─ published_stories index          (article_id, ordered by first_published_at desc)
       ├─ resolveFeaturedId(explicit, index)   lib/publishing/home.ts (pure)
       └─ published_stories snapshots for the featured story + one page of 12
            └─ PublishedStoryV1 re-validation → toCard() (tokens resolved, public fields only)
```

- **Featured story:** the editor's explicit choice while it is live; otherwise the newest live story. If the featured snapshot fails validation, the next story leads. The featured story is never repeated under Latest stories.
- **Ordering:** by original publication date, newest first, so republishing updates a story in place without moving it. "Updated <date>" is shown when the latest publication differs from the first.
- **Artwork:** the article's own first chart (macro, else analytics), at most two lines, drawn as SVG from the snapshot's data (`LeadChartArt`). With no chart, the featured slot uses a centred, type-only layout. No images (D-020).
- **Counts:** zero stories → masthead + empty state. One story → featured only (no empty Latest section). More than 12 others → `?page=N` with Newer/Older links; malformed or out-of-range pages render the nearest valid page.
- **Navigation:** header Latest + About; footer Latest stories, About, Standards. The Phase 2A prototype pages (`/stories/*`, `/section/*`) stay reachable by URL but are no longer linked (D-053).

## Schema (migrations `20261127180000_homepage_feature.sql`, `20261127183000_homepage_feature_column_grants.sql`, additive)

| Object | Purpose |
|---|---|
| `homepage_feature` (one row, `id = true`) | `article_id` → `published_stories(article_id)` **ON DELETE SET NULL**: only a live article can be featured; unpublishing clears the feature in the same transaction; republishing (row updated in place) keeps it. `updated_at`, `updated_by` for the record. |
| `set_featured_article(uuid \| null)` | SECURITY DEFINER, `is_editor()` check, row lock; outcomes `featured` / `cleared` / `unchanged`; `not_live` for a non-live article. Granted to `authenticated` only. |
| Grants | anon/authenticated: `SELECT (id, article_id, updated_at)` only — readers never see who chose the feature. No direct writes for anyone. |

## Studio

- Draft page → publication panel, for live articles: *Homepage — Featured / Leads as newest / Listed under Latest stories* with **Feature on homepage** or **Remove feature** (server action `setFeaturedArticle`, `app/admin/publish-actions.ts`).
- Drafts list: a **Featured** badge.
- Publish, unpublish and feature actions call `revalidatePath('/')` (ready for 3D caching; the page is per request today).

# Phase 3D.1a — model roles and FRED request discipline

## Model roles (D-058)

`lib/studio/model-roles.ts` maps each stage to a role and resolves the model: role variable → `ARLI_MODEL`. It also holds the per-family thinking-off switch. `roleLlm` (`lib/studio/llm.ts`) routes each request by stage. All clients share the module-level serialisation queue. This is interim until the 3D.2 gateway replaces it.

## FRED requests (D-059, D-060)

```
stage code ──▶ fredProvider ──▶ per-stage metadata de-duplication ──▶ shared limiter ──▶ fetchJson ──▶ FRED API
                (known meta reused)  (transient Map, cleared by          (1 in flight, ≥1 s apart,
                                      runner.beginStage)                   429 backoff, 403 circuit)
```

- **Metadata reuse:** screening (discover) and the fetch stage pass the candidate metadata they already hold (from the discover output, which is persisted under the existing workflow) to `fetch(id, start, known)`. FRED is then asked only for observations.
- **De-duplication:**
  - repeated or concurrent `meta()` calls for the same series within one stage share one request;
  - series returned by a search are not looked up again;
  - failures are not remembered;
  - the map is in memory, per provider instance, and the runner clears it before every stage.
- **Instrumentation:** `metrics.stages[*].requests.fred` holds `series/search`, `series`, `series/observations`, `http429`, `http403`, `blocked`, `waitMs`, plus `metaReused` and `metaKnown` (requests avoided).

### Scope of the limiter and breaker: process-local, not distributed

- The limiter, its 429 cooldown and its 403 circuit live in module memory of one server process. A warm Vercel instance shares them across the invocations it serves; separate instances do not share them.
- **In practice:** generation runs one stage per request, and only one job is active at a time (one-active-job index plus lease, D-010/D-026). FRED is called only from the discover and fetch stages, so FRED traffic is effectively sequential across the deployment. Brief, Polish and Fix It make no FRED calls.
- **Gap:**
  - a stage that lands on a fresh instance does not inherit an earlier 429 cooldown or 403 circuit, so it can send one request before reacting (the per-stage discovery breaker then opens after two failures);
  - the 60/min ceiling is per process, so it holds deployment-wide only because of the one-job rule.

  A shared limiter (database row or KV) would close this gap. It is not built.
