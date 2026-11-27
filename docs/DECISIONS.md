# Decision Log

Significant technical decisions with rationale. Claude Code appends here
whenever a binding decision is made; superseded decisions keep their row
with status `Superseded by D-xxx`.

| ID | Date | Decision | Rationale | Status |
|----|------|----------|-----------|--------|
| D-001 | 2026-11-26 | Repository lives at `C:\project\FinStory`, default branch `main`, remote `https://github.com/BaoQihong/FinStory.git` | Uses the pre-created empty GitHub repo; stays independent from the other projects under `C:\project` | Adopted |
| D-002 | 2026-11-26 | Supabase and Vercel CLIs installed globally via npm; `gh` CLI deliberately skipped | npm prefix already on PATH; Git + Git Credential Manager covers GitHub auth, so `gh` adds footprint without need in Phase 1 | Adopted |
| D-003 | 2026-11-26 | Env variable names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `ARLI_API_KEY`, `ARLI_BASE_URL`, `ARLI_MODEL` | Matches Supabase's current API-key system (publishable/secret) and the OpenAI-compatible client convention; legacy anon/service_role names noted in `.env.example` | Adopted |
| D-004 | 2026-11-26 | Secrets only in git-ignored `.env.local`; `.env.example` is the single tracked template | Standard Next.js convention; prevents credential leakage via Git | Adopted |
| D-005 | 2026-11-26 | Later-phase documents (`PRODUCT`, `ARCHITECTURE`, `DESIGN_SYSTEM`) created as explicitly marked placeholders | Phase 1 forbids product-design and architecture decisions | Adopted |
| D-006 | 2026-11-26 | Known LLM constraints recorded: limited context capacity, single-request concurrency for the Arli AI Qwen endpoint | Given in the project brief; must shape Phase 2/3 architecture (chunking, queueing, caching) | Superseded by D-010 (context size) |
| D-007 | 2026-11-26 | `DATABASE_URL` uses the Supavisor transaction pooler (`aws-2-us-east-1.pooler.supabase.com:6543`) | Recommended for serverless (Vercel) workloads; direct/session connections (5432) can be added later if migrations need them | Adopted |
| D-008 | 2026-11-26 | Provisional `ARLI_MODEL=Qwen3.8-27B` (base model) | Plain instruct model suits factual financial content; other Qwen entries on the account are community fine-tunes (roleplay/uncensored). Final model choice is revisited in Phase 3 | Provisional |
| D-009 | 2026-11-26 | Qwen calls send `chat_template_kwargs: { enable_thinking: false }` unless reasoning is explicitly wanted | Qwen3-family models reason by default; reasoning tokens consumed the whole `max_tokens` budget and returned empty `content` in testing. Disabling it gave a clean reply with 0 reasoning tokens | Adopted |
| D-010 | 2026-11-26 | Arli AI context window is **128k tokens, shared between prompt and output**; single-request concurrency still assumed | Confirmed by product owner. Supersedes the "limited context" assumption in D-006; concurrency constraint unchanged | Adopted |
| D-011 | 2026-11-26 | Dependency-free Node scripts for setup and verification (`scripts/setup/`, `scripts/verify/`) | No `package.json` exists yet and framework choice is a later-phase decision; scripts use only Node 22 built-ins and redact secrets from all output | Adopted |
