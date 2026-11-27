# Operations

> **Status: PARTIAL PLACEHOLDER.** The infrastructure inventory below is
> live (Phase 1). Deployment pipelines and runbooks are defined in
> Phase 3.

## Infrastructure inventory

| Service | Role | Reference | Status (Phase 1) |
|---------|------|-----------|------------------|
| GitHub | Source control | `https://github.com/BaoQihong/FinStory` | Remote reachable via Git Credential Manager; first commit local, not yet pushed |
| Supabase | Backend (Postgres, auth, storage) | project ref `gmcllutljmotushrsqka` (us-east-1, Postgres 17) | CLI logged in + linked; API keys and Postgres pooler verified |
| Vercel | Hosting and deployment | `q-f977/financial_storyteller` | Linked; Git integration → `BaoQihong/FinStory`, production branch `main`; project Node 26.x (see P1-14) |
| Arli AI | LLM (Qwen via OpenAI-compatible API) | `https://api.arliai.com/v1`, model `Qwen3.8-27B` (provisional) | Chat completion verified. 128k-token window shared by prompt + output; single-request concurrency |

## Verification

Run from the repo root at any time; output never contains secret values:

```
node scripts/verify/connectivity.mjs                # all checks
node scripts/verify/connectivity.mjs --only=arli --list-models
node scripts/setup/supabase-keys.mjs                # (re)fetch Supabase API keys via the CLI
```

## Known gotchas

- `vercel link` / `vercel env pull` rewrite `.env.local` and append
  `.env*` to `.gitignore`, which un-negates `.env.example`. Re-check
  `.gitignore` after running them.
- Qwen3 models reason by default and burn `max_tokens` on it — send
  `chat_template_kwargs: { enable_thinking: false }` (D-009).

No duplicate cloud projects may be created — always reuse the existing
ones above.

## Credential handling

- All secrets live in `.env.local` (git-ignored). `.env.example` is the
  canonical list of variable names.
- The product owner provides or authorizes every credential. Claude Code
  never writes secrets into docs, logs, commits, or chat output.
- Supabase keys: publishable key is client-safe; the secret key is
  server-side only.

## CLI authentication

- **Git/GitHub**: Git Credential Manager (system-level
  `credential.helper=manager`).
- **Supabase**: `supabase login` (browser OAuth); token stored by the CLI.
  Then `supabase link --project-ref gmcllutljmotushrsqka`.
- **Vercel**: `vercel login` (browser); then `vercel link` in the repo
  root to bind the existing project.

## Environments and deployment

To be defined in Phase 3. Expected direction: Vercel Git-integration
deployments from `main`; Supabase schema changes applied as migrations
via the CLI. Not decided yet.

## Incident and maintenance runbooks

Phase 3 placeholder.
