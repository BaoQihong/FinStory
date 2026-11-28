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
| P3B-15 | Commit, push, deploy 3B | Done | Deployed with 3C (P3C-10) |

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
| P3C-10 | Commit, push, deploy 3B + 3C | Done | `9c235fc` + `50cee01` pushed 2026-11-27; Vercel production live. Production checks: home 9/10, route 9/10 — the only failure in each was the cache-header assertion (Vercel sends "public, max-age=0, must-revalidate" for the prerendered shell; data is per request, proven by the lifecycle steps). Assertion relaxed in a follow-up commit; production re-run pending |
| P3C-11 | Decide: retire or keep the delisted Phase 2A prototype routes | Not started | Product-owner decision; currently reachable by URL only |

Note: during documentation work a shell-quoting mistake ran `publish:home-check` once against the production URL (2026-11-27). It used fixtures only, cleaned them up and restored the (empty) feature; production did not yet serve the new homepage, so nothing reached readers.

## v0.1 editorial testing — enhancements (within approved Phase 3C scope)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| V01-01 | Investigate the blocking issues on "The index fund paradox" draft | Done | Both blockers were validator false positives ("making **up** {share}"); a third false positive was found in the gold draft ("{price} **as** of" → "per s"). Fixed in the validator (D-056) |
| V01-02 | Fix It for Me: pure core, server action, dialog UI, docs | Done | D-055; `lib/editorial/fix.ts`, `app/admin/fix-actions.ts`, `components/studio/PublishPanel.tsx` |
| V01-03 | Tests: unit + live model probe | Done | 91/91 unit tests. Live, temporary copies: an injected level-as-change error was resolved in 1 attempt on both runs (6 s and 41 s). The housing draft (3 attention flags + 1 unknown token) was fully resolved in 2 attempts on one run; on another, the 200-character watch item stayed too long after all 3 attempts, so it was reported unresolved at the cap |
| V01-04 | Browser acceptance of Fix It for Me by a signed-in editor | Not started | Assistant may not type passwords; steps in the delivery notes / TESTING.md |
| V01-05 | Commit, push, deploy | Not started | Awaiting product-owner approval |
| V01-06 | Outlook scenario flexibility: 1-3 scenarios chosen by the evidence | Done | D-063. Prompt, generation schema, validator and article grid. 134/134 tests and `npm run verify` pass. Not yet deployed: awaiting product-owner approval |
| V01-07 | Chart rendering fixes: fragmented/missing lines in multi-series charts, clipped end labels, indicator-card sparkline overflow | Done | D-064. Shared renderer only (`TimeSeriesChart`, `IndicatorCard`); no data, content, prompt or model change. 11 new tests (`scripts/data/chart-geometry.test.ts`); browser QA on the weak-dollar article at 1280/768/375 px, the Bond Comeback core CPI gap, and injected long values/units in 170 px cards |
| V01-08 | Long bare URLs in article references overflow the page at 375 px (seen on the weak-dollar article) | Open | Pre-existing; outside the V01-07 brief |

## Phase 3D

Deferred: production polish, tag-based caching of public pages, SEO/social.

### 3D.1 — LLM qualification, benchmarking and evaluation (research only) — COMPLETE 2026-11-28

Report: `docs/research/phase-3d1-model-evaluation.md`. Harness: `research/model-eval/`. Production unchanged.

| ID | Task | Status | Notes |
|---|---|---|---|
| P3D1-01 | Audit current LLM implementation (read-only) | Done | Report §8 |
| P3D1-02 | Verify live Arli catalog and preliminary candidates; shortlist | Done | 122 models; 7 distinct candidates present; 4 added (Gemma-it, Gemma-Writers, Qwen Flash-Next, MiMo Flash) |
| P3D1-03 | Standalone resumable sequential harness | Done | `run.ts`, `aggregate.ts`, `anonymize.ts` (`--rep`), `report-tables.ts`; SSE in-stream errors recorded as failures; `--timeout` can lengthen case timeouts |
| P3D1-04 | Technical qualification (19 probes × 11 models) | Done | antislop and Gemma-Distill thinking-on excluded; DeepSeek ignores `enable_thinking:false` |
| P3D1-05 | Tests A–E (pilot → full; round 2 for leading models) and Test F (10 production stages × 10 configs) | Done | All Test F responses that finished parse and validate against production schemas |
| P3D1-06 | Blind qualitative review (rubric fixed first) | Done | `samples/households-v1*/SCORES.md` |
| P3D1-07 | Report and role recommendations | Done | Shortlist: DeepSeek Flash (thinking off/on), MiMo Flash, Qwen3.8-27B fallback |
| P3D1-08 | Human editor scores a subset; second subject; larger n | Not started | Recommended before any production switch (report §9) |
| P3D1-09 | Product-owner decision on the pre-existing uncommitted gateway work in the tree | Done | Kept unchanged as commit on local branch `wip/model-gateway` (rebased on `main`); not merged, not deployed. Picked up in 3D.2 |
| P3D1-10 | Report (not fix): undated Zandi quote in the quote store; `factsForSeries` 13-month "1y" change when the year-ago month is missing | Open | Report §8 |
| P3D1-11 | Commit research artifacts | Done | Committed on `main` as permanent development infrastructure (raw API bodies and logs stay git-ignored) |

### 3D.1a — Interim model upgrade (D-058) — COMPLETE 2026-11-28

Branch `phase-3d1a-model-roles` (worktree `C:\project\FinStory-3d1a`, from `db44ea0`). Not committed or deployed.

| ID | Task | Status | Notes |
|---|---|---|---|
| P3D1a-01 | Model roles by env (`ARLI_ANALYTICAL_MODEL`, `ARLI_EDITORIAL_MODEL` → `ARLI_MODEL`) and stage routing | Done | `lib/studio/model-roles.ts`, `roleLlm`; prompts and schemas unchanged |
| P3D1a-02 | Per-family thinking-off switch; reasoning/finish/model capture; `[llm]` log line | Done | Qwen body byte-identical (tested) |
| P3D1a-03 | Unit tests | Done | `scripts/studio/model-roles.test.ts` (18); `npm run verify` green |
| P3D1a-04 | Live probe | Done | `model-probe.ts`: reasoning 0 for DeepSeek, MiMo and Qwen; DeepSeek prompt tokens 88→62; strict JSON correct |
| P3D1a-05 | End-to-end mixed-model draft | Done, with findings | Temporary draft `c27b3e65`: all 12 stages ok on their intended models, 0 reasoning tokens, 506 s. Outlook (DeepSeek): 1 scenario with two fields cut mid-sentence (blocking attention). Real-vs-nominal income comparison error in story and analytics. 13-month "1y" facts used (upstream, P3D1-10). The first attempt (`98b9e230`, temporary) failed at fetch: FRED HTTP 403 from this IP |
| P3D1a-06 | Commit, Vercel env and deploy | Done | `3c218bf` pushed to `main` (fast-forward); deployed with Qwen defaults first, then `ARLI_ANALYTICAL_MODEL` / `ARLI_EDITORIAL_MODEL` added to Production and redeployed (2026-11-28). The first live studio action confirms the models in `/admin/usage`. Rollback: `vercel env rm` both, then redeploy |
| P3D1a-07 | FRED provider mapped HTTP 403 (and other non-retryable errors) to "series not found" | Done | Fixed in P3D1a-08 |
| P3D1a-08 | FRED error classification, throttling (≤ 60/min, one in flight), 429 backoff, 403 circuit breaker, per-stage request counts | Done | D-059; `scripts/studio/fred.test.ts` (7) |
| P3D1a-09 | **HIGH — real vs nominal comparison error.** Story (MiMo) and analytics (DeepSeek) compare *real* median income growth with *nominal* cumulative CPI and conclude households "lost ground" (draft `c27b3e65`). Real income is already deflated | Open | Model-generated. No validator check exists for this. Article stays unpublished |
| P3D1a-10 | **HIGH — broken outlook (DeepSeek).** 1 scenario (≥ 2 expected); `watch[0]` and `uncertainties[0]` cut mid-sentence at exactly the schema limits (200/300 chars) with finish = stop; the repair rewrite was discarded for exceeding the limits | Open | Likely strict json_schema maxLength cutting long text during decoding. Caught by review (blocking attention), not by the schema |
| P3D1a-11 | **HIGH — incorrect year-over-year calculation.** `cpiHeadlineChg1y` and `electricityCpiChg1y` span Sep 2025 → Oct 2026 (13 months) and are used in prose as "over the year" | Open | Upstream system defect (`factsForSeries`, P3D1-10), not model-generated |
| P3D1a-12 | **HIGH — quotation provenance.** The quote store cannot establish when a quoted statement was made: an undated quote ("Tuesday's CPI report", P3D1-10) can be presented as current commentary, and source dates can contradict content (S6/S9 in `c27b3e65`: 2017/2022 metadata, 2026 content). Quotes in `c27b3e65` itself were verified fragments | Open | Upstream system defect |
| P3D1a-13 | FRED terms-of-use review before any caching or expanded FRED-dependent AI workflows | Open | Product owner |
| P3D1a-14 | Keep the test drafts `98b9e230`, `c27b3e65` (and the throttled test-3 draft) temporary and unpublished | Ongoing | Temporary drafts cannot be published |
| P3D1a-15 | FRED duplicate-request reduction: metadata reuse and per-stage de-duplication | Done, deployed | D-060. Households brief, test 3 (`337e2f5a`) → test 4 (`0343f191`): FRED requests 167 → 92; metadata lookups 104 → 29; throttle wait 131 → 68 s; discover 147 → 82 s; fetch 20 → 10 s. 42 candidates both runs; needs covered 12 → 13; validation 0 errors both. Total wall time 627 → 709 s, inflated by one 200 s Arli timeout on story (509 s without it). Screening cap not changed (option c dropped) |
| P3D1a-16 | **FRED terms review: findings to resolve** (read 2026-11-28; API terms and the general FRED legal page; no last-updated date shown) | Deferred by the product owner (2026-11-28): findings retained; no further investigation or attribution UI for now; no persistent caching or new FRED-dependent features. Longer-term: move data acquisition to Thoth and original providers (not started) | (1) The general terms prohibit "Store, cache, or archive any portion of" FRED content and incorporating it "in any database, compilation, archive, cache" without written consent. Seshat already stores FRED observations (job outputs, `datasets`, published snapshots); this is a larger question than the transient de-duplication, which may still literally count as caching. (2) "Any commercial use" needs the Bank's prior written consent. (3) An AI/ML clause bars use "in connection with the development or training of" ML or generative-AI systems; whether supplying FRED data to an LLM during generation is covered is unclear. (4) Third-party copyrighted series need the owner's permission beyond personal use; `lib/studio/registry.ts` includes `SP500` (S&P). (5) The API terms require the notice "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis" and a terms link in apps for other users; the site shows neither. Not legal advice; the legal-page text after the general terms was read only in summary |
| P3D1a-17 | **Manual production check:** a signed-in editor runs one studio action that calls the model (Develop brief, or a generation), then confirms in `/admin/usage` (or the Vercel `[llm]` logs) that analytical stages show `DeepSeek-V4.1-Flash-1017` and story/polish show `MiMo-V2.6-Flash-MOPD` | Open | The deployed env vars are confirmed and the code path is verified locally, but no production model call has been observed yet |

### v0.1 studio enhancements

| ID | Task | Status | Notes |
|---|---|---|---|
| V01-06 | Delete never-published drafts from the studio | Done, deployed | D-062. `scripts/studio/delete.test.ts` (9 tests); live checks: throwaway draft deleted with revisions cascading, a live article refused, the guarded delete matched 0 rows on a live article |
