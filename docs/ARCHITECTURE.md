# Architecture

> **Status: Phase 2A prototype architecture.** Describes what is built.
> Production architecture (database schema, APIs, data pipelines, LLM
> integration) remains a Phase 3 decision.

## Stack

Next.js 16 App Router (Turbopack, Cache Components), React 19, TypeScript 5,
Tailwind CSS 4, Recharts 3. Node 22.x. Hosted on Vercel via Git integration
(`main` → production). See D-013–D-015.

Every route is statically prerendered at build time. There are no API
routes, no environment variables in use by the app, and no runtime calls to
Supabase or Arli AI in Phase 2A.

## Layout

```
app/                     routes: / · /stories/[slug] · /section/[section] · /about · 404
components/
  site/                  header, footer, nav, Seshat mark
  editorial/             story cards, chapter nav, evidence tags, hero pattern
  article/               ArticleView (five layers), asset icons
  charts/                TimeSeriesChart (client), ChartFigure, IndicatorCard, Sparkline, YieldSplit
  home/                  LeadVisual
content/                 editorial content (TypeScript), index of sections/articles
lib/
  data/                  types.ts (SeriesFixture, DisplaySeries), display.ts (Fact, ChartData…), transforms.ts
  content/               article model (types.ts), fact tokens, reading time
  stories/bond-comeback/ build.ts (pure: fixtures → facts, indicators, charts) · index.ts (server-only loader)
data/fred/               version-controlled FRED fixtures (one JSON per series)
scripts/data/            fetch-fred.mjs · validate-fixtures.ts · transforms.test.ts
```

## Data flow

```
FRED CSV ──fetch-fred.mjs──▶ data/fred/<ID>.json  (SeriesFixture: source, units, frequency,
                                                   retrievedAt, sha256, observations[null=missing])
                                   │
                    lib/stories/bond-comeback/build.ts   (pure; also run by validate-fixtures.ts)
                                   │
             facts / dates / indicators / charts / split
                                   │
 content/articles/*.ts ──fact tokens {y10Peak}──▶ lib/content/tokens.ts ──▶ rendered copy
                                   │
     Server Components render text, cards, tables; only the chart points
     needed for drawing are passed to the client TimeSeriesChart.
```

## Content model (Phase 3 mapping)

`lib/content/types.ts` defines `PublishedArticle` (metadata, key points,
narrative blocks, macro indicators + chart blocks + explainers, analytics
split / chain / chart / implications, outlook scenarios, methodology,
citations) and `PreviewArticle`. These map naturally onto future tables
(`articles`, `article_blocks`, `scenarios`, `citations`, `series`,
`observations`); fact tokens become references to stored derived values.

## Phase 3 replacement points

- `scripts/data/fetch-fred.mjs` → scheduled retrieval writing the same
  `SeriesFixture` shape to Supabase.
- `content/` → database-backed content with an editorial CMS.
- `lib/stories/<story>/build.ts` → per-story derivations computed at
  publish time and stored with the article.
