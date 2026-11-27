# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Newest entries first.

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
