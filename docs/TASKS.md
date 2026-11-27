# Tasks

Active task tracker. Claude Code maintains this file: add tasks, update
statuses, and close them as work proceeds. IDs use the format
`P<phase>-<nn>`.

Statuses: `Done` · `In progress` · `Blocked` · `Not started`.

## Phase 1 — Project preparation (complete)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P1-01 | Inspect local environment | Done | Git 2.56.1, Node v22.23.5, npm 10.9.9; GCM configured system-wide |
| P1-02 | Initialize repo + GitHub remote | Done | Branch `main`; origin `https://github.com/BaoQihong/FinStory.git` (remote currently empty) |
| P1-03 | Install Supabase + Vercel CLIs | Done | Global npm installs; supabase 3.4.0, vercel 67.0.0 |
| P1-04 | Credential files | Done | `.gitignore`, `.env.example`, `.env.local` (untracked) |
| P1-05 | Documentation skeleton | Done | All Phase 1 docs + later-phase placeholders |
| P1-06 | Supabase login + link project | Done | CLI authenticated; linked to `gmcllutljmotushrsqka` (ACTIVE_HEALTHY, us-east-1, PG 17) |
| P1-07 | Retrieve Supabase API keys → `.env.local` | Done | Publishable (`sb_publishable_`) + secret (`sb_secret_`) via `scripts/setup/supabase-keys.mjs` |
| P1-08 | Verify Supabase connectivity | Done | Both keys PASS (auth settings + admin users endpoints, HTTP 200) |
| P1-15 | Rotate Supabase personal access token | Not started | Token was pasted in a chat session; rotate before production (Dashboard → Account → Access Tokens) |
| P1-09 | Obtain `DATABASE_URL` | Done | Transaction pooler, port 6543 (D-007); connection verified |
| P1-10 | Vercel login + link project | Done | Logged in; linked to existing `q-f977/financial_storyteller`; Git integration → `BaoQihong/FinStory`, prod branch `main` |
| P1-11 | Arli AI credentials + connectivity test | Done | `Qwen3.8-27B` (provisional, D-008) replied "pong", 0 reasoning tokens; 128k shared window (D-010) |
| P1-13 | Connectivity tooling | Done | `scripts/setup/supabase-keys.mjs`, `scripts/verify/connectivity.mjs` (no deps, never print secrets) |
| P1-14 | Align Vercel Node version with local | Done | Vercel project now reports Node 22.x; `package.json` `engines.node = 22.x` pins it (D-013) |
| P1-12 | Verification pass + initial local commit | Done | 6/6 connectivity checks pass; secret scan of 25 tracked files clean; commit `7ce3b17` (not pushed) |
| P1-16 | Push `main` to GitHub | Done | Approved via the Phase 2A brief ("commit, push to GitHub and deploy"); pushed with the Phase 2A commit |

## Phase 2A — Public frontend, editorial experience & financial data (active)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P2A-01 | Inspect repo + design reference; plan | Done | Plan reported in session; deviations recorded in D-019–D-021 |
| P2A-02 | Next.js app scaffold (TS, Tailwind 4, ESLint) | Done | D-013; `vercel.json` framework override (D-014) |
| P2A-03 | FRED data acquisition → `data/fred/*.json` | Done | 5 series, window 2000-01-01 → 2026-11-24, retrieved 2026-11-27 UTC (D-016) |
| P2A-04 | Transforms, story data builder, fact tokens | Done | `lib/data/`, `lib/stories/bond-comeback/`, `lib/content/tokens.ts` (D-017, D-018) |
| P2A-05 | Article content model + Bond Comeback copy + 3 previews | Done | `lib/content/types.ts`, `content/`; copy drafted for product-owner editorial review |
| P2A-06 | Editorial + chart components | Done | Indicator cards, time-series, sparkline, yield split, transmission chain, implications, scenarios, chapter nav |
| P2A-07 | Pages: home, story, previews, sections, about, 404 | Done | All statically prerendered |
| P2A-08 | Tests: unit + data validation + lint + typecheck + build | Done | `npm run verify`; see `docs/TESTING.md` |
| P2A-09 | Visual QA desktop + 375px mobile | Done | No horizontal overflow on any page; label collisions fixed |
| P2A-10 | Commit, push, Vercel deploy | Done | Commit `5c2884f`; production https://financialstoryteller.vercel.app (all routes 200, unknown route 404) |
| P2A-11 | Product owner visual & product review | Done | Approved by the product owner in the Phase 2B brief (2026-11-26) |
| P2A-12 | Editorial review of demonstration copy | Not started | Copy written by Claude Code as a stand-in for human editorial work |
| P2A-13 | Social/OG image (typographic, generated from data) | Not started | Optional polish; no AI imagery |

## Phase 2B — AI editorial research & generation engine (active)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P2B-01 | Inspect repo, provider research, architecture plan | Done | Plan reported in session; D-023–D-032 |
| P2B-02 | Credentials: Tavily, FRED, Tiingo, editor login → `.env.local` | Done | All verified live; `scripts/setup/env-from-clipboard.mjs --var` added |
| P2B-03 | Supabase migration (editors, articles, revisions, jobs, stage runs, sources, findings, datasets; RLS) | Done | Applied to `gmcllutljmotushrsqka`; RLS verified from anon + editor sides (`npm run studio:editor`) |
| P2B-04 | Canonical schema SeshatArticleV1 + validation | Done | `lib/studio/schema.ts`, `validate.ts`, `numbers.ts` |
| P2B-05 | Providers: Tavily, FRED, Tiingo, EIA (gated) + curated registry | Done | 47/47 registry ids verified; EIA disabled (no key) |
| P2B-06 | Deterministic data engine (units, derived series, facts, indicators, charts) | Done | `lib/studio/facts.ts`, `units.ts` |
| P2B-07 | Staged pipeline + runner (lease, retries, partial drafts) | Done | 11 stages; mocked end-to-end tests |
| P2B-08 | Generalised renderer (render model) — Phase 2A unchanged | Done | Production HTML diff of the Bond Comeback page: identical |
| P2B-09 | Editorial studio: login, drafts, new story, generation panel, section editors, research/data/checks/history, preview | Done | `/admin` |
| P2B-10 | Vercel production env vars | Done | 8 vars; provider keys marked sensitive; no service-role key |
| P2B-11 | Live engine integration runs (script) | Done | 6 live runs (yen ×4, oil ×1) surfaced FX-direction, superlative, translation-logic and wrong-dataset errors — all fixed with tests (D-033) |
| P2B-12 | Acceptance test A (yen) through the studio UI | Not started | |
| P2B-13 | Acceptance test B (crude oil) through the studio UI | Not started | No code changes between A and B |
| P2B-14 | Commit, push, deploy; completion report | Done | `8a72660`, `673944f`, `c3a51d7` deployed |
| P2B-15 | EIA API key for oil inventories/production + electricity | Done | Petroleum verified; electricity endpoints down at EIA during testing (D-034) |
| P2B-16 | Tiingo licence review before public publishing | Not started | Free tier = internal use only (D-025); gate for 2C |
| P2B-18 | Usage ledger per service & key; temporary drafts; /admin/usage | Done | D-035; migration 20261127090000 |
| P2B-19 | Product-owner test drafts: US housing; AI data centers & electricity | Done — awaiting review | v2 drafts adf41c39… (housing, needs attention: 1 invalid token + flagged superlatives) and 8629779e… (AI power); v1 drafts kept as "[Superseded v1]"; all temporary — delete on request |
| P2B-20 | EIA electricity endpoints | Blocked (external) | HTTP 504/timeouts at EIA 26–27 Nov; re-test with `npm run studio:check-registry` |
| P2B-12b | Acceptance A/B through the browser UI | Blocked | Needs the product owner to sign in to /admin in Chrome (assistant may not type passwords) |
| P2B-21 | Final reliability pass: quantities, references, counter-evidence, outages, editorial checks | Done | D-037–D-041; 41 tests |
| P2B-22 | Frozen-code acceptance: housing + AI electricity through the studio UI | Blocked | Needs the product owner to sign in to /admin in Chrome |
| P2B-17 | Disable public sign-ups in Supabase Auth | Not started | Product owner deferred ("fine for proto"); RLS allow-list already blocks non-editors |
| P2B-23 | AI-assisted editorial brief builder (Develop Editorial Brief → review → Research & Generate) | Done — awaiting product-owner review | D-042; quick path unchanged; live-probed on Japan equities + copper (1 attempt, ~12–16 s, ~900 tokens each); UI check needs the product owner signed in to /admin |

## Phase 2C

Superseded by Phase 3A (D-043).

## Phase 3A — Publishing engine (active)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P3A-01 | Inspect repo; implementation plan; approvals | Done | Product owner approved the plan and the migration; Tiingo = warning for now |
| P3A-02 | Migration: identity columns, publication_revisions, published_stories, publish/unpublish functions, guard trigger, RLS | Done | `20261127150000_publishing_engine.sql` applied to `gmcllutljmotushrsqka` (additive) |
| P3A-03 | Publishing library: snapshot contract, validation, slugs, state | Done | `lib/publishing/` (D-044–D-046) |
| P3A-04 | Server actions + studio publication panel, dialog, badges, history | Done | `app/admin/publish-actions.ts`, `components/studio/PublishPanel.tsx` |
| P3A-05 | Phase 3B public data contract | Done | `lib/publishing/public.ts` (`getPublishedStory`, `listPublishedStories`) |
| P3A-06 | Tests: unit + live integration (`npm run publish:check`) | Done | 9 unit tests; 12/12 integration checks against Supabase |
| P3A-07 | Browser check of the publishing UI | Blocked | Needs the product owner signed in to /admin (assistant may not type passwords) |
| P3A-08 | Commit, push, deploy | Done | `b1cdb61` pushed; Vercel production Ready (all public routes 200, `/admin` → login, `/story/*` 404 until 3B) |
| P3A-09 | Decide: Tiingo licence before wide distribution | Not started | Currently a non-blocking warning (P2B-16) |
| P3A-10 | Optional: bind the snapshot to the draft inside the database (hash/derivation) | Not started | Accepted trade-off for now (D-045) |

## Phase 3B — public article experience (3B.1) and editorial quality (3B.2) (active)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P3B-01 | Context recovery, plan | Done | Plan reported in session; ArticleView already shared, so 3B.1 = adapter + route |
| P3B-02 | `fromSnapshot()` / shared `fromContent()` mapping; "Updated" date; public footer | Done | WYSIWYG unit tests |
| P3B-03 | `/story/[slug]` route, metadata, proxy 404 check, no-store | Done | D-047 |
| P3B-04 | Studio: View published article, copy URL, preview banner link, remove 3A notice | Done | |
| P3B-05 | Live route lifecycle check (`npm run publish:route-check`) | Done | 10/10 locally (production build) |
| P3B-06 | Browser check desktop + mobile; indicator-card overflow fix | Done | 5 px overflow at 375 px fixed with `min-w-0` (also in the preview) |
| P3B-07 | Pipeline audit with concrete examples | Done | `docs/editorial/PIPELINE_AUDIT.md` |
| P3B-08 | Style guide (versioned) + prompt restructure + author argument/voice | Done | D-048 |
| P3B-09 | Editorial Polish (actions, review UI, protected-content checks) | Done | D-049; UI check needs a signed-in editor |
| P3B-10 | Controlled editorial evaluation (3 articles) | Done — awaiting product-owner judgment | `docs/editorial/EVALUATION.md` |
| P3B-11 | Byline editable; default role "Editorial team" | Done | D-050 |
| P3B-12 | Decide: correct the live article's byline role / watch-list wording (needs republish) | Not started | Product-owner decision; article untouched |
| P3B-13 | Browser acceptance of studio changes (Publish links, byline, Polish) by a signed-in editor | Blocked | Assistant may not type passwords |
| P3B-14 | Decide data licensing for public display (UMich, S&P via FRED; Tiingo; snapshot scope) | Not started | `docs/DATA_LICENSING.md` (D-051) |
| P3B-15 | Commit, push, deploy 3B | In progress | Committed locally; push + Vercel deploy await product-owner approval |

## Phase 3C — editorial homepage (active) → Seshat v0.1, Editorial MVP

| ID | Task | Status | Notes |
|----|------|--------|-------|
| P3C-01 | Inspect repo, verify 3B status, plan | Done | 3B committed locally (`9c235fc`), not pushed/deployed; plan approved with "delist prototype, keep URLs" and the additive migration |
| P3C-02 | Migration: `homepage_feature` + `set_featured_article()`; column-level read grant | Done | `20261127180000`, `20261127183000` applied to `gmcllutljmotushrsqka` (D-054) |
| P3C-03 | `getHomepage()` + pure helpers (featured fallback, cards, lead-chart artwork) | Done | `lib/publishing/public.ts`, `lib/publishing/home.ts` |
| P3C-04 | Homepage `/`: masthead, featured, latest grid, pagination, empty state; nav/footer/About | Done | D-053 |
| P3C-05 | Studio: Feature on homepage / Remove feature; Featured badge | Done | UI check needs a signed-in editor |
| P3C-06 | Tests: unit + `npm run publish:home-check` + regressions | Done | 78/78 unit; home 10/10, route 10/10, publish 12/12 against a local production build |
| P3C-07 | Browser QA desktop + 375 px (0 / 1 / several stories) | Done | Temporary fixtures removed; empty state via a reverted local edit |
| P3C-08 | Code review | Done | `updated_by` readable by anon → fixed by column grant; invalid featured snapshot → next story leads; masthead UTC date removed |
| P3C-09 | Browser acceptance of the studio Feature control by a signed-in editor | Blocked | Assistant may not type passwords |
| P3C-10 | Commit, push, deploy 3B + 3C | In progress | Awaiting product-owner approval to push/deploy (3B is not yet deployed either) |
| P3C-11 | Decide: retire or keep the delisted Phase 2A prototype routes | Not started | Product-owner decision; currently reachable by URL only |

Note: during documentation work a shell-quoting mistake ran `publish:home-check` once against the production URL (2026-11-27). It used fixtures only, cleaned them up and restored the (empty) feature; production did not yet serve the new homepage, so nothing reached readers.

## Phase 3D

Deferred: production polish, tag-based caching of public pages, SEO/social.
