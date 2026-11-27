# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Newest entries first.

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
