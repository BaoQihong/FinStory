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
| P2A-10 | Commit, push, Vercel deploy | In progress | |
| P2A-11 | Product owner visual & product review | Not started | Next milestone; gate for Phase 2B |
| P2A-12 | Editorial review of demonstration copy | Not started | Copy written by Claude Code as a stand-in for human editorial work |
| P2A-13 | Social/OG image (typographic, generated from data) | Not started | Optional polish; no AI imagery |

## Phase 2B / 2C

Not started. Requires explicit product owner approval to begin.

## Phase 3 — Application development, deployment and operations

Not started. Requires product owner approval to begin.
