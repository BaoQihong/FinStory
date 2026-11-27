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

## Principles (to expand in later phases)

- Test user-visible behavior first (editorial pipeline correctness).
- Keep LLM-dependent tests deterministic where possible (recorded/mocked
  responses); live-model tests run separately and never block CI.
- Respect the Arli AI single-request concurrency constraint in any test
  harness (no parallel live calls).
