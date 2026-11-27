# Testing

> **Status: PARTIAL PLACEHOLDER.** The Phase 1 verification checklist
> below is live. The full test strategy will be defined in Phase 2/3.

## Phase 1 verification (infrastructure smoke checks)

One-time connectivity checks, not a test suite. Each result is recorded
in `docs/TASKS.md`:

1. **Local repo functional** — `git status` clean workflow on `main`.
2. **GitHub authentication** — `git ls-remote origin` succeeds; push
   permission confirmed (dry-run is sufficient in Phase 1).
3. **Supabase connectivity** — CLI linked to project `gmcllutljmotushrsqka`;
   a minimal authenticated REST call using keys from `.env.local` returns
   a valid response.
4. **Vercel linkage** — `vercel ls` / project link resolves to the
   pre-created project.
5. **Arli AI** — a minimal chat-completion request to `ARLI_BASE_URL` with
   `ARLI_MODEL` returns a valid completion.
6. **Credential hygiene** — `.env.local` untracked; `git ls-files` output
   contains no secrets (scan for key patterns before commit).

## Phase 2A checks (run before every commit)

`npm run verify` runs, in order:

| Step | Command | What it checks |
|------|---------|----------------|
| Unit tests | `npm test` | `lib/data/transforms` — YoY from index levels, gap handling (no interpolation), annualized rates, monthly averages, date alignment, "highest since", policy-move detection |
| Data validation | `npm run data:validate` | Fixture integrity (metadata, ascending unique dates, finite/null values); independent recomputation of every headline fact from raw observations; real + breakeven = nominal identity; "highest since" claims; every article fact token resolves; **no hardcoded percentages in copy**; referenced charts/indicators exist |
| Lint | `npm run lint` | ESLint (next/core-web-vitals + TypeScript) |
| Types | `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| Build | `npm run build` | Production build; all routes prerender |

Manual / browser checks performed for 2A (repeat after visual changes):

- Desktop (1280px) review of home, article (all five layers), previews,
  sections, about, 404.
- Mobile (375px) — scripted check that no element extends past the
  viewport on every route; visual check of chapter tab bar and compact
  charts.
- Chart label collisions, legends, tooltips, "Show the data" tables.
- Every navigation link resolves (no dead buttons; previews clearly marked).

## Principles (to expand in later phases)

- Test user-visible behavior first (editorial pipeline correctness).
- Keep LLM-dependent tests deterministic where possible (recorded/mocked
  responses); live-model tests run separately and never block CI.
- Respect the Arli AI single-request concurrency constraint in any test
  harness (no parallel live calls).
