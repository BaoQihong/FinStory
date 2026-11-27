# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Newest entries first.

## [Unreleased]

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
