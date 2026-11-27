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

**Phase 2A (current):** pushing `main` to GitHub triggers a Vercel
production deployment via the Git integration. `vercel.json` forces the
Next.js framework preset (the dashboard preset is "Other", D-014);
`package.json` `engines.node` pins Node 22.x. The app uses no environment
variables, so nothing needs configuring in Vercel for 2A.

Refreshing data (manual in 2A):

```
npm run data:fetch      # re-download FRED series into data/fred/
npm run data:validate   # recompute & check every fact; fails if copy no longer matches
```

If the latest observation date changes, update `dataCutoff` in
`content/articles/the-bond-comeback.ts` (the validator enforces it) and
re-read the copy — narrative statements may need editorial revision.

Phase 3 will define preview/production environments and Supabase
migrations.

## Database migrations

Migrations live in `supabase/migrations/` and are applied to the linked
production project with `npx supabase db push --remote --dry-run` and
then `npx supabase db push --remote --yes`. They need product-owner
approval, and only additive changes are made without a separate decision.
Check with `npx supabase migration list --remote`. Applied so far:
`20261126120000`, `20261127090000`, `20261127150000` (publishing engine), `20261127180000` + `20261127183000` (homepage feature, Phase 3C).

## Publishing (Phase 3A)

- Unpublishing is the way to take a story down: the live row is removed and the history is kept.
- Published articles cannot be deleted (FK restrict, D-044).
- `npm run publish:check` is safe to run against production. It uses uniquely named fixtures and removes them.

## Public articles (Phase 3B.1)

- Public URL: `https://financialstoryteller.vercel.app/story/<slug>`. Rendered per request from `published_stories` (no cache), so unpublishing takes effect immediately.
- If public pages return 404 for live stories, check `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` on Vercel: the proxy existence check uses them. A Supabase *outage* fails open to the page, which then errors (500) rather than showing a false 404.
- After a deploy: `npm run publish:route-check -- --base https://financialstoryteller.vercel.app` (creates and removes its own fixture articles).

## Homepage (Phase 3C)

- `/` lists every live story (newest first, 12 per page) and leads with the featured one. To change the lead, open a live article in the studio → publication panel → **Feature on homepage** / **Remove feature**. With nothing featured, the newest story leads; unpublishing a featured story clears the feature automatically.
- After a deploy: `npm run publish:home-check -- --base https://financialstoryteller.vercel.app`. Its fixtures are visible on the live homepage for a few seconds; it restores the feature that was set before the run.

## Editorial Polish (Phase 3B.2)

- Usage appears in `/admin/usage` as stage `polish` (evaluation runs as `evaluation`). Limit: 40 Polish requests per 24 h; refused while a generation job runs (single Arli concurrency).
- A Polish request on Vercel can take up to about 2 min; the draft page sets `maxDuration = 300`.

## Incident and maintenance runbooks

Phase 3 placeholder.
