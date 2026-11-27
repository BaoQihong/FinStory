# Tasks

Active task tracker. Claude Code maintains this file: add tasks, update
statuses, and close them as work proceeds. IDs use the format
`P<phase>-<nn>`.

Statuses: `Done` · `In progress` · `Blocked` · `Not started`.

## Phase 1 — Project preparation (active)

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
| P1-14 | Align Vercel Node version with local | Not started | Vercel project set to Node 26.x; local is 22.x — decide before Phase 3 deploys |
| P1-12 | Verification pass + initial local commit | Done | 6/6 connectivity checks pass; secret scan of 25 tracked files clean; commit `7ce3b17` (not pushed) |
| P1-16 | Push `main` to GitHub | Not started | Awaiting product owner go-ahead; first push will trigger a Vercel deployment via Git integration |

## Phase 2 — Product design and interactive visual prototyping

Not started. Requires product owner approval to begin.

## Phase 3 — Application development, deployment and operations

Not started. Requires product owner approval to begin.
