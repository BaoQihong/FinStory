# FinStory

> Working name — final commercial name and branding to be decided.

FinStory is a consumer-oriented financial storytelling platform that
transforms human-authored editorial content into visually compelling
narratives, macroeconomic insights, quantitative analytics and conditional
market predictions.

## Status

**Phase 1 — project preparation and infrastructure configuration.**
No application code exists yet. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Documentation map

| Document | Purpose |
|----------|---------|
| [`CLAUDE.md`](CLAUDE.md) | Operating instructions for Claude Code sessions |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Product vision and scope (Phase 2 placeholder) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phase plan and current status |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Technical architecture (Phase 2/3 placeholder) |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Visual design system (Phase 2 placeholder) |
| [`docs/TASKS.md`](docs/TASKS.md) | Task tracker |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Change history |
| [`docs/TESTING.md`](docs/TESTING.md) | Testing strategy |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Infrastructure inventory and operations |
| [`docs/source-material/`](docs/source-material/) | Human-authored editorial source content |
| [`docs/design/`](docs/design/) | Design prototypes and assets |

## Local setup

1. Prerequisites: Node.js 22+, npm 10+, Git.
2. Install CLIs: `npm install -g supabase vercel`
3. Copy `.env.example` to `.env.local` and fill in credentials
   (obtained via the product owner; never committed).

## Security

Secrets live only in git-ignored `.env*` files. `.env.example` lists the
required variable names with non-sensitive placeholders.
