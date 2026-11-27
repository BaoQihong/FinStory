# Architecture

> **Status: PLACEHOLDER — Phase 2/3 document.** Architecture decisions are
> deliberately NOT made in Phase 1. Do not treat anything here as decided.

## Constraints known from Phase 1 setup

- **Hosting**: Vercel (project already created).
- **Backend**: Supabase project `gmcllutljmotushrsqka` (Postgres, auth,
  storage).
- **LLM**: Qwen models via Arli AI's OpenAI-compatible API. **Assume a
  limited context window and single-request concurrency** — any design
  must plan for chunking/summarization of long editorial inputs and
  serialized or queued LLM calls (see D-006 in `docs/DECISIONS.md`).
- The Phase 1 environment variable naming anticipates a Next.js-style
  frontend, but framework selection itself is a Phase 2/3 decision.

## To be decided (Phase 2/3)

- Framework, rendering strategy and project structure
- Data model and Supabase schema design
- LLM integration pattern: caching, queueing, retries, fallbacks
- Editorial content ingestion and storage
- Environments (development / preview / production) and deployment
  topology
