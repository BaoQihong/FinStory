# Roadmap

Three-phase delivery plan. **Phase transitions require product owner
approval.** The current phase is marked below; Claude Code sessions must
not begin work belonging to a later phase.

## Phase 1 — Project preparation and infrastructure configuration

**Status: IN PROGRESS** (started 2026-11-26)

Goal: a verified local and cloud foundation — repository, connectivity to
all four services, secure credential management, and the documentation
skeleton.

- [x] Inspect local environment (Git 2.56.1, Node 22.23.5, npm 10.9.9)
- [x] Initialize repository and connect GitHub remote (`BaoQihong/FinStory`, branch `main`)
- [x] Install Supabase CLI (3.4.0) and Vercel CLI (67.0.0) via npm
- [x] Credential management files (`.gitignore`, `.env.example`, `.env.local`)
- [x] Documentation structure (this directory)
- [ ] Supabase CLI login and project link (`gmcllutljmotushrsqka`) — needs product owner (browser auth)
- [ ] Retrieve Supabase API keys into `.env.local`; verify REST connectivity
- [ ] Obtain database connection string (`DATABASE_URL`)
- [ ] Vercel CLI login and project link — needs product owner (browser auth)
- [ ] Arli AI: base URL, API key, model ID from product owner; connectivity test
- [ ] Verification pass (see `docs/TESTING.md` § Phase 1 verification)
- [ ] Initial local commit; confirm no secrets in tracked files

Exit criteria: all connectivity checks pass, credentials secured, docs in
place, preparation work committed locally.

## Phase 2 — Product design and interactive visual prototyping

**Status: NOT STARTED — do not begin without product owner approval.**

Placeholder. Scope will be defined with the product owner (creative
director) at phase start. Expected outputs: product definition
(`docs/PRODUCT.md`), design system (`docs/DESIGN_SYSTEM.md`), interactive
visual prototypes (`docs/design/`), and the architecture direction that
Phase 3 builds on.

## Phase 3 — Application development, deployment and operations

**Status: NOT STARTED — do not begin without product owner approval.**

Placeholder. Expected outputs: architecture decisions
(`docs/ARCHITECTURE.md`), application implementation, test suite
(`docs/TESTING.md`), CI/CD and Vercel deployment, Supabase migrations,
operational runbooks (`docs/OPERATIONS.md`).
