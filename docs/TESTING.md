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

## Phase 3A — publishing checks

- `npm test` includes `scripts/publishing/publishing.test.ts`: state derivation, slugify/validation/duplicates, blocking vs warning rules, snapshot completeness and leakage, and snapshot independence from later edits.
- `npm run publish:check` runs against the real Supabase project with the editor session plus the anon key. It creates fixture articles and deletes them afterwards, using the secret key for cleanup only. Its 12 checks cover acceptance criteria 1–12: publishing, invalid/temporary drafts, unique slugs, edits not touching the snapshot, unpublished changes, stale and slug-changing requests, 5 concurrent republishes giving exactly one publication, history retention, idempotent unpublish, anon unable to read drafts/history/unpublished stories, direct writes rejected, and republishing under the same slug.
- Criterion 13 (Phase 2 unchanged): the full `npm run verify`.
- The studio UI is checked manually by a signed-in editor (see the Phase 3A handover).

## Phase 3B — public article and editorial quality

- `npm test` adds: render-model equality between preview and public (WYSIWYG), no attention notes in public, `fromDraft` unchanged (publishing.test.ts); the author's argument, voice and style guide reaching every writing stage, and later stages seeing earlier sections (pipeline.test.ts); Editorial Polish whitelist, checks, stale refusal and apply isolation (polish.test.ts).
- `npm run publish:route-check -- --base <url>` (live HTTP + Supabase, fixtures only): baseline article loads anonymously without private fields; never-published draft by slug and by id → 404; unknown or malformed slugs → 404 with `no-store`; publish → 200; editing the draft leaves the public page unchanged; republish updates the same URL; unpublish → immediate 404; republish restores; deleted article → 404. Run it against `npm run build && npx next start -p 3217` locally, or against production after deploy.
- `npm run editorial:eval`: controlled before/after editorial comparison (live Arli, about 15 calls, no draft writes); output in `docs/editorial/evaluation/results.json`, summarised in `docs/editorial/EVALUATION.md`.
- Browser: desktop (1280) and mobile (375, measured in a same-origin iframe because the window could not be resized) checks of the public article: no horizontal overflow after the indicator-card fix, charts, tables and scenarios render.
- **Not automatable here:** the studio UI (Publish panel links, byline editor, Editorial Polish review) needs a signed-in editor; the assistant may not type passwords. Server-action logic is covered by the pure-module unit tests above.

## Phase 3C — editorial homepage

- `npm test` adds `scripts/publishing/home.test.ts`: featured selection and fallback, page parsing, card model (public fields only, story URL, original/updated dates, token resolution, unresolvable copy skipped), lead-chart artwork (own first chart, at most two lines, thinned, absent when no chart).
- `npm run publish:home-check -- --base <url>` (live HTTP + Supabase, fixtures only; restores the prior feature): the inflation article is discoverable and prototype pages are not listed; drafts never appear; a new publication appears with its `/story/<slug>` link and no private fields; newest-first ordering and default lead; featuring leads without repeating; only live articles can be featured, only by editors, and anon cannot read `updated_by`; draft edits stay private and republishing updates in place, keeping the feature; unpublishing removes the story and falls back; a deleted article disappears; malformed/out-of-range pages render. **While it runs, fixtures are briefly live** on any deployment reading this project.
- Browser (local production build): desktop 1440 and mobile 375 (same-origin iframes) for one story with chart artwork, several stories (temporary labelled fixtures, removed straight after), and the empty state (local dev server with the data forced empty, reverted). No horizontal overflow at 375 px. The article page is unchanged.
- **Not automatable here:** the studio Feature control needs a signed-in editor; the database function behind it is covered by the live check.

## Principles (to expand in later phases)

- Test user-visible behavior first (editorial pipeline correctness).
- Keep LLM-dependent tests deterministic where possible (recorded/mocked
  responses); live-model tests run separately and never block CI.
- Respect the Arli AI single-request concurrency constraint in any test
  harness (no parallel live calls).
