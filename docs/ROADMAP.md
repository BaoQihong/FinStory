# Roadmap

Three-phase delivery plan. **Phase transitions require product owner
approval.** The current phase is marked below; Claude Code sessions must
not begin work belonging to a later phase.

## Phase 1 — Project preparation and infrastructure configuration

**Status: COMPLETE** (2026-11-26). Closed when the product owner issued the Phase 2A brief.

Goal: a verified local and cloud foundation — repository, connectivity to
all four services, secure credential management, and the documentation
skeleton.

- [x] Inspect local environment (Git 2.56.1, Node 22.23.5, npm 10.9.9)
- [x] Initialize repository and connect GitHub remote (`BaoQihong/FinStory`, branch `main`)
- [x] Install Supabase CLI (3.4.0) and Vercel CLI (67.0.0) via npm
- [x] Credential management files (`.gitignore`, `.env.example`, `.env.local`)
- [x] Documentation structure (this directory)
- [x] Supabase CLI login and project link (`gmcllutljmotushrsqka`)
- [x] Retrieve Supabase API keys into `.env.local`; verify REST connectivity
- [x] Obtain database connection string (`DATABASE_URL`)
- [x] Vercel CLI login and project link
- [x] Arli AI: base URL, API key, model ID; connectivity test
- [x] Verification pass (see `docs/TESTING.md` § Phase 1 verification)
- [x] Initial local commit; confirm no secrets in tracked files

Exit criteria: all connectivity checks pass, credentials secured, docs in
place, preparation work committed locally.

## Phase 2 — Product design and interactive visual prototyping

**Status: IN PROGRESS — Phase 2A complete and approved; Phase 2B approved and active (2026-11-26).**

Phase 2 is delivered in sub-phases, each approved separately:

- **2A — Public frontend, editorial experience & financial data** — **complete, approved.**
  Homepage, one complete five-layer demonstration story ("The Bond
  Comeback") built on real FRED data, reusable editorial and chart
  components, Vercel deployment. Exclusions: auth, CMS, AI/Arli calls,
  live data ingestion, subscriptions, personalization, trading,
  forecasting engines. Next milestone: product owner visual and product
  review of the deployed site (approved).
- **2B — AI editorial research, analytics & story generation engine** ← **current.**
  Editor-only studio at `/admin` (Supabase Auth + RLS), staged Arli-driven
  research → data → narrative pipeline producing drafts in the canonical
  four-section storyboard, editable and previewable in the 2A template.
  Exclusions: public publishing, multi-editor, autonomous topics, images,
  subscriptions, advice/trading, forecasting engines.
- **2C — Public publishing** — not started; **do not begin until 2B is reviewed and approved.**

Original placeholder scope (still indicative): Expected outputs: product definition
(`docs/PRODUCT.md`), design system (`docs/DESIGN_SYSTEM.md`), interactive
visual prototypes (`docs/design/`), and the architecture direction that
Phase 3 builds on.

## Phase 3 — Application development, deployment and operations

**Status: NOT STARTED — do not begin without product owner approval.**

Placeholder. Expected outputs: architecture decisions
(`docs/ARCHITECTURE.md`), application implementation, test suite
(`docs/TESTING.md`), CI/CD and Vercel deployment, Supabase migrations,
operational runbooks (`docs/OPERATIONS.md`).
