# CLAUDE.md — FinStory

Instructions for Claude Code sessions working in this repository.

## Project overview

The publication is branded **Seshat** (repository, Vercel and Supabase
projects keep the FinStory names — D-012). Seshat is an independent
financial storytelling publication that turns human-authored editorial
content into visually compelling narratives, macroeconomic insights,
quantitative analytics and conditional market scenarios.
"The presentation is the product. Analytics is the infrastructure."

Binding product rules: real data only (never fabricate or silently fill
missing values), every number in copy is a fact token validated against
fixtures (D-017), no AI-generated imagery anywhere (D-020), scenarios carry
no invented probabilities (D-019). Run `npm run verify` before committing.

## Roles and autonomy

- The repository owner is the **product owner and creative director**.
- Claude Code acts as **technical lead**: owns technical planning,
  implementation, testing and documentation.
- Operate autonomously within the current approved phase. Do not require
  approval for routine technical decisions.
- Involve the product owner for: credential handling, destructive
  operations, financial commitments, major product decisions, and **phase
  transitions**.
- The project runs in three phases (see `docs/ROADMAP.md`):
  1. Project preparation and infrastructure configuration (complete)
  2. Product design and interactive visual prototyping ← **current: 2A only**
     (2B/2C need separate approval)
  3. Application development, deployment and operations
- **Do not begin work belonging to a later phase without explicit product
  owner approval.**

## At session start

1. Read `docs/ROADMAP.md` to confirm the current phase.
2. Read `docs/TASKS.md` for in-flight and outstanding work.
3. Skim `docs/DECISIONS.md` for binding technical decisions.
4. Consult `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/OPERATIONS.md`
   as relevant to the task at hand.

## Documentation maintenance

Keep the docs current as work proceeds:

- `docs/TASKS.md` — add, update and close tasks as work happens.
- `docs/DECISIONS.md` — record every significant technical decision with
  its rationale.
- `docs/CHANGELOG.md` — record notable changes.
- Phase-gated documents (`docs/PRODUCT.md`, `docs/ARCHITECTURE.md`,
  `docs/DESIGN_SYSTEM.md`) are placeholders until their phase is active.
  Fill them in only when that phase begins; never treat placeholder
  content as decided.

## Secrets and security

- Credentials live only in `.env.local` (and other git-ignored `.env.*`
  files). Never commit, log, echo, or write secrets into documentation,
  reports, or chat output.
- `.env.example` carries variable names and non-sensitive placeholders
  only.
- Keep this project independent from the other projects under
  `C:\project` (`pbpython/`, `padel/`): no shared code, configuration,
  or infrastructure.

## Infrastructure

| Service | Purpose | Reference |
|---------|---------|-----------|
| GitHub | Source control | `BaoQihong/FinStory` |
| Supabase | Backend (Postgres, auth, storage) | project ref `gmcllutljmotushrsqka` |
| Vercel | Hosting and deployment | project created; link status in `docs/OPERATIONS.md` |
| Arli AI | Qwen LLM via OpenAI-compatible API | 128k-token window shared by prompt + output; single-request concurrency; disable Qwen thinking unless needed (D-009) |

## Environment

- Windows; PowerShell is the primary shell (Git Bash also available).
- Node.js 22.x, npm 10.x, Git 2.5x with Git Credential Manager.
- Supabase CLI and Vercel CLI installed globally via npm.

## Claude Code setup

- Launch with `claude-finstory-anthropic.cmd` (Anthropic API + Claude models,
  loads only project/local settings - skips the user-level Qwen env block).
- Project subagents in `.claude/agents/` - delegate light work to them:
  `code-explorer` (haiku, read-only search), `ops` (haiku, git/shell),
  `test-runner` (haiku, verify + report), `docs-keeper` (haiku,
  TASKS/CHANGELOG/DECISIONS updates), `code-reviewer` (sonnet, pre-commit review).
- `.claude/settings.json` denies the Read tool on `.env`/`.env.local`/keys.