# Seshat

> *The stories behind the numbers.* Repository name: FinStory.

Seshat is an independent financial storytelling publication: human-written
journalism about economics, markets and wealth, measured against real data
and presented as beautiful, progressively disclosed stories.

## Status

**Phase 2A — public frontend, editorial experience & financial data.**
A static Next.js prototype with a homepage and one complete five-layer
story, *The Bond Comeback*, built on FRED data. See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Quick start

```
npm install
npm run dev            # http://localhost:3000
npm run verify         # unit tests, data validation, lint, typecheck, production build
npm run data:fetch     # refresh FRED fixtures (then run data:validate)
```

Requires Node.js 22.x (`.nvmrc`). The app needs no environment variables in
Phase 2A.

## Where things live

| Path | Contents |
|------|----------|
| `app/` | Routes (home, stories, sections, about) |
| `components/` | Site shell, editorial, article and chart components |
| `content/` | Editorial content — articles and previews |
| `lib/` | Data types, transforms, story data builders, content model, fact tokens |
| `data/fred/` | Version-controlled FRED observations with source metadata |
| `scripts/` | Data fetch/validation, Phase 1 setup and verification tooling |

## Documentation

| Document | Purpose |
|----------|---------|
| [`CLAUDE.md`](CLAUDE.md) | Operating instructions for Claude Code sessions |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Product definition and editorial standards |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phase plan and current status |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Prototype architecture and data flow |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Visual design system |
| [`docs/TASKS.md`](docs/TASKS.md) | Task tracker |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Change history |
| [`docs/TESTING.md`](docs/TESTING.md) | Test and verification procedures |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Infrastructure, deployment, data refresh |
| [`docs/design/`](docs/design/) | Design reference and asset attribution record |

## Security

Secrets live only in git-ignored `.env*` files; `.env.example` lists
variable names only. Run `node scripts/verify/secrets-scan.mjs` before
pushing.
