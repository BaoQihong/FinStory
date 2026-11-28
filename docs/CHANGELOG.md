# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Newest entries first.

## 0.6.4 — 2026-11-28 (studio: delete never-published drafts)

- **Delete draft** at the foot of the draft page (D-062).
  - Available for drafts that have never been published, including failed generations; refused while generating or while Polish/Fix It is running.
  - The confirmation dialog lists what is removed and focuses Cancel.
  - Afterwards the drafts list shows a "Deleted" notice.
  - Published or previously published articles show why they cannot be deleted.
- Server-side checks and a delete filtered on "never published" (`lib/studio/delete-draft.ts`); the database's publication-history constraint stays the final guard.
- Tests: `scripts/studio/delete.test.ts` (9).

## 0.6.3 — 2026-11-28 (FRED duplicate-request reduction; 3D.1 research committed)

- **FRED duplicate-request reduction** (D-060): screening and the fetch stage reuse metadata already retrieved, and identical metadata lookups within a stage share one request (in memory, cleared every stage, never stored). About 45% fewer FRED requests per job (167 → 92) and discover about 1.8× faster (147 → 82 s). Coverage and limits unchanged.
- `DataProvider.fetch` takes optional known metadata; providers may implement `beginStage()`. New request counters `metaReused` and `metaKnown`.
- Tests: 6 new in `scripts/studio/fred.test.ts`.
- Docs: ARCHITECTURE § Phase 3D.1a (model roles, FRED request path, process-local limiter scope). FRED terms findings in TASKS P3D1a-16.

## 0.6.2 — 2026-11-28 (Phase 3D.1a: interim model upgrade)

- **Model roles chosen by environment variable** (D-058). `ARLI_ANALYTICAL_MODEL` covers plan, select, synthesize, macro_analytics, outlook, review, repair, brief and Fix It. `ARLI_EDITORIAL_MODEL` covers story and Polish. Both fall back to `ARLI_MODEL`. With neither set, behaviour and request bodies are unchanged (Qwen3.8-27B). The experiment is DeepSeek-V4.1-Flash-1017 for analytical stages and MiMo-V2.6-Flash-MOPD for editorial ones, both with thinking off.
- **Per-family thinking switch** (`lib/studio/model-roles.ts`): DeepSeek ignores `enable_thinking:false` and now also receives `thinking:false`, verified live (reasoning tokens 0).
- **Observability:** one `[llm]` log line per Arli call (stage, model, ms, tokens incl. reasoning, finish reason, errors). A warning is logged if reasoning appears while thinking is off. Stage metrics and the usage ledger record the model actually used.
- **Scripts:** `scripts/studio/model-probe.ts` (live thinking-off and structured-output check). `generate-draft.ts` gains `--brief-from <articleId>`, prints model, reasoning and finish per stage, and takes the model variables from the process environment.
- **Tests:** `scripts/studio/model-roles.test.ts` (18 tests: precedence, routing, byte-identical Qwen body, thinking switches, serialisation across models, logging, repair round and fallback unchanged).
- **FRED (D-059):**
  - an access-denied (403) or rate-limited (429) answer is no longer reported as "series not found";
  - requests are throttled to one at a time and at most 60 per minute, with bounded 429 backoff and a 15-minute 403 circuit breaker;
  - per-stage request counts by endpoint (`metrics.stages[*].requests`, `[provider]` log line);
  - no caching.
- **Tests:** `scripts/studio/fred.test.ts` (7 tests).
- Unchanged: prompts, schemas, fact tokens, validation, repair, templates, outlook rules, publishing and Arli concurrency.

## 3D.1 — 2026-11-28 (LLM evaluation, research only; no application release)

- New standalone research harness `research/model-eval/`. Nothing in `app/` or `lib/` imports it.
  - Commands: catalog, qualification, benchmark suites A–F, aggregation, blind anonymisation, report tables.
  - Data: frozen FRED and Seshat-stage fixtures; a fixed rubric.
- Report `docs/research/phase-3d1-model-evaluation.md`:
  - 11 models qualified and 12 configurations benchmarked, plus the 10 real production stages;
  - role recommendations for 3D.2.
- No production change: `ARLI_MODEL`, prompts, schemas, templates, workflows and drafts are untouched.

## 0.6.1 — 2026-11-28 (v0.1 editorial testing: Fix It for Me, validator false positives)

- **Fix It for Me** in the publication dialog's blocking-issues panel: up to three targeted AI repair attempts on the passages behind blocking issues. Each successful attempt is saved as a new draft revision, and the dialog stays open and re-runs the publication checks. Changes are shown before and after, with removed or qualified claims called out. Rejected rewrites and anything that needs the editor (data, structure, licence, editorial-judgement notes) are listed. It never publishes (D-055).
- Shared repair core `lib/studio/repair.ts`: the generation repair stage and Fix It use the same prompt and output schema (generation prompt unchanged). Editorial Polish's field diff is exposed as `revisionDelta()` (behaviour unchanged).
- Validator false positives fixed (D-056): "making up {share} of the index" is no longer read as a change, and "{price} as of 25 November" is no longer read as "per s". Genuine level-vs-change and unit errors are still caught (new regression tests).
- `saveDraft` takes an optional `{ revalidate: false }`; generation and the brief builder also wait for an in-flight Fix It call (single Arli request, D-010).
- Tests: `scripts/studio/fix.test.ts` (unit) and `npm run editorial:fix-check -- <articleId> [--inject-level-as-change]` (live model probe on temporary copies).

## 0.6.0 — 2026-11-27 (Phase 3C: editorial homepage) — **Seshat v0.1, Editorial MVP**

Milestone: an editor can create, edit and publish an article, and a reader can discover and read it from the homepage. v0.1 = Phase 1 (infrastructure), Phase 2 (editorial creation workflow), 3A (publishing engine), 3B (public article rendering and editorial quality), 3C (public editorial homepage). Phase 3D remains deferred.

- Homepage `/` rebuilt from live published content: masthead, featured story (headline, standfirst, byline, dates, real-data chart artwork from the article's own lead chart or a type-only layout), Latest stories grid (section, headline, summary, date, author), simple pagination, empty state. Per request, no cache (D-053).
- Featured article: one at a time, live articles only, automatic fallback to the newest story; **Feature on homepage / Remove feature** in the studio publication panel and a Featured badge in the drafts list (D-054).
- Migrations `20261127180000_homepage_feature.sql` and `20261127183000_homepage_feature_column_grants.sql` (additive; applied).
- Navigation: header Latest + About; minimal footer. Phase 2A prototype pages delisted (still reachable by URL); About page note updated.
- Tests: `scripts/publishing/home.test.ts` (unit) and `npm run publish:home-check` (live HTTP lifecycle with fixtures).
- Removed the unused prototype `LeadVisual` component.

## 0.5.0 — 2026-11-27 (Phase 3B: public article experience and editorial quality)

### 3B.1 — public article
- Public article page `/story/[slug]`: the live published snapshot rendered through the same ArticleView as the editorial preview (shared render mapping, WYSIWYG), with first-published and updated dates, a public footer note, and title/description metadata (D-047).
- Real HTTP 404 (never cached) for unknown, unpublished and deleted stories via a slug-only proxy check; pages are rendered per request, so republish and unpublish take effect immediately.
- Studio: **View published article** and copy URL in the publication panel; a live-article link in the preview banner; the Phase 3A notice removed; byline editable on the Story tab, and new drafts default to role "Editorial team" (D-050).
- Fix: indicator cards no longer overflow the viewport by 5 px on 375 px screens.
- `npm run publish:route-check`: live HTTP lifecycle check with fixtures.

### 3B.2 — editorial quality
- Pipeline audit with concrete examples (`docs/editorial/PIPELINE_AUDIT.md`).
- Versioned editorial style guide (`lib/editorial/style-guide.ts`, `docs/EDITORIAL_STYLE_GUIDE.md`) used by every writing stage and by Polish.
- Prompts restructured: editorial intent vs research direction; new optional brief fields **Your argument** and **Tone and voice**; the thesis is built from the author's argument, with an honest supported/contradicted assessment; later sections see what earlier sections said; a stricter Outlook. No additional generation calls (D-048).
- **Editorial Polish**: per-section line edit with side-by-side review, per-field acceptance, deterministic protection of figures, dates, quotations, references and certainty wording, stale-proposal refusal, usage tracking; never publishes (D-049).
- Controlled before/after evaluation (`npm run editorial:eval`, `docs/editorial/EVALUATION.md`) and prose diagnostics (`lib/editorial/signals.ts`).
- Data licensing review of the public path (`docs/DATA_LICENSING.md`, D-051): flagged, nothing changed.

## 0.4.0 — 2026-11-27 (Phase 3A: publishing engine)

- Publish, republish and unpublish from the draft page, with a confirmation dialog showing the draft revision and publication number, blocking errors, warnings, the slug and a note. Duplicate submissions are prevented (D-043–D-046).
- Migration `20261127150000_publishing_engine.sql`: permanent slugs and publication columns on `articles`, immutable `publication_revisions`, public `published_stories`, atomic `publish_article` / `unpublish_article` functions and a guard trigger.
- Public data contract for Phase 3B (`lib/publishing/public.ts`); publication badges on the drafts list and draft header; publications in the History tab; the preview banner shows whether the draft matches the live publication.
- Tests: `scripts/publishing/publishing.test.ts` (in `npm test`) and `npm run publish:check` (live lifecycle, RLS and concurrency checks).

## 0.3.3 — 2026-11-27 (Phase 2B enhancement: editorial brief builder)

- **Develop Editorial Brief** on /admin/new: AI-suggested angle, questions, markets and indicators, outlook focus and premise to verify, all editable; regeneration keeps edited fields; per-field “Suggest again”; quick path (prompt → Research & Generate) unchanged (D-042).
- New optional brief fields `indicators`, `outlook`, `premise` reach every pipeline stage via the brief block; the draft page shows the brief; /admin/usage lists brief suggestions separately.

## 0.3.2 — 2026-11-27 (Phase 2B final reliability pass — frozen for acceptance)

- Structured quantity metadata + claims ledger (D-037); reference integrity (D-038); counter-checks, candidate screening, dispersion, all Case-Shiller metros (D-039); circuit breaker + explicit evidence gaps (D-040); verified superlatives, duplicate words, severity ordering (D-041).

## 0.3.1 — 2026-11-27

- EIA provider (petroleum series; electricity via native v2 routes, fail-fast), housing/electricity/power-equity registry additions (D-034).
- Usage ledger per service and API-key fingerprint; `/admin/usage`; temporary drafts (D-035).
- Reasoning safeguards: FX direction, superlatives, review→repair fact-check stage, sign/unit clean-up, event-series guard, year precision, no cents on large dollar amounts (D-033).
- `scripts/studio/generate-draft.ts` (editor-session generation, D-036).

## 0.3.0 — 2026-11-26

- Phase 2B: editorial studio (`/admin`), staged generation engine, canonical four-section schema, Supabase persistence with RLS, Tavily/FRED/Tiingo providers (D-023–D-032).

## [Unreleased]

### Added — 2026-11-26 (Phase 2A: Seshat public prototype)

- Next.js 16 / React 19 / TypeScript / Tailwind 4 application (`app/`, `components/`, `content/`, `lib/`).
- Seshat brand shell: header with section navigation (desktop bar, no-JS mobile menu), footer, SVG Seshat mark and favicon.
- Homepage: lead story with a real-data lead visual, three “In preparation” story previews, section directory.
- “The Bond Comeback” demonstration article in five layers — headline, narrative, macro, analytics, outlook — with chapter navigation, indicator cards, three interactive charts with data tables, yield-split comparison, evidence-labelled transmission chain, asset implications and three conditional scenarios.
- Section pages, preview pages, About / editorial standards page, 404.
- FRED fixtures for DGS10, DFII10, DFF, CPILFESL, A191RL1Q225SBEA (`data/fred/`) with `npm run data:fetch`.
- Data validation (`npm run data:validate`, 300+ checks) and transform unit tests (`npm test`); `npm run verify` runs everything.
- `vercel.json` (framework: nextjs); `engines.node` 22.x.
- `scripts/verify/secrets-scan.mjs`, `scripts/setup/env-from-clipboard.mjs` and `.nvmrc` (Phase 1 tooling, now committed).

### Changed — 2026-11-26

- Phase 1 marked complete; Phase 2A active (`docs/ROADMAP.md`).
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md` filled in for the Phase 2A prototype.

### Added — 2026-11-26 (Phase 1 preparation)

- Initialized Git repository (`main`) with GitHub remote `BaoQihong/FinStory`.
- Documentation skeleton: `CLAUDE.md`, `README.md`, and `docs/` with
  `PRODUCT`, `ROADMAP`, `ARCHITECTURE`, `DESIGN_SYSTEM`, `TASKS`,
  `DECISIONS`, `CHANGELOG`, `TESTING`, `OPERATIONS`, plus
  `docs/source-material/` and `docs/design/` directories.
- Credential management: `.gitignore` (excludes all `.env*` except
  `.env.example`), `.env.example` template, local `.env.local` scaffold.
- Installed Supabase CLI 3.4.0 and Vercel CLI 67.0.0 globally via npm.
- Linked Supabase project `gmcllutljmotushrsqka` and Vercel project
  `q-f977/financial_storyteller`; all credentials configured in `.env.local`.
- `scripts/setup/supabase-keys.mjs` and `scripts/verify/connectivity.mjs`
  (dependency-free, secret-redacting) — all six connectivity checks pass.

### Fixed — 2026-11-26

- Removed `.env*` / `.vercel` lines appended to `.gitignore` by `vercel link`;
  `.env*` overrode the `!.env.example` exception.
