# Market data licensing — outstanding launch consideration

> Status: **open, needs product-owner decision before wider distribution.**
> Nothing here has been purchased, upgraded or suppressed. Tracked as P3A-09 /
> P2B-16 and P3B-14.

## Current position

| Provider | Terms in use | Used by |
|---|---|---|
| FRED (St. Louis Fed) | Free API. FRED's own data is public, but **some series are third-party copyrighted** and FRED passes their terms through | All drafts |
| Tiingo | Free/development tier: **internal use only** (D-025) | Equity/ETF series in drafts. The publish dialog warns, but does not block (D-046) |
| EIA | US government data, public domain | Energy drafts |
| Tavily | Search provider. Reader-facing text cites source documents by title and URL only | All drafts |

## Review of the live article (Phase 3B.1, 2026-11-27)

`/story/why-your-wallet-feels-broke-even-when-inflation-is-falling`
(publication 1):

- **No Tiingo data.** All ten datasets come from FRED.
- **Third-party copyrighted FRED series in the article:**
  - `UMCSENT`, the University of Michigan Consumer Sentiment index (© University of Michigan). It is **displayed publicly**: the Macro indicator card (latest value and 24-point sparkline) and three figures in the copy.
  - `SP500`, the S&P 500 index (© S&P Dow Jones Indices; FRED notes that reproduction needs S&P's permission). Derived values appear publicly as the "S&P 500 real return" figures in the copy (two fact tokens).
- **The full snapshot is readable through the public API.** `published_stories` is anon-readable by design (D-044). The snapshot contains every computed data product of the draft, including indicator cards and facts the page does not display (for example the raw S&P 500 sparkline and 1-year/5-year highs and lows). Anyone with the publishable key, which is public, can read them. This exposes more provider data than the rendered page does.
- Attribution is preserved: "Sources & method" lists every series with provider, series id, units, frequency, latest observation and retrieval date.

**Nothing has been changed.** The article remains as approved; these points
are flagged for decision.

## Decisions needed before launch

1. **Public price and chart displays:** whether Tiingo-sourced prices and charts may appear on public pages (requires a commercial/redistribution plan), and whether copyrighted FRED series (S&P indices, University of Michigan, other third-party series) may be shown as charts or cards, or only cited in text.
2. **Historical content retention:** published snapshots keep the data as of publication, indefinitely (immutable history, D-044). Licences that limit retention or require removal on termination would conflict with that.
3. **Derived analytics:** real returns, changes and highs/lows are derived from licensed series. Some licences treat derived data as redistribution.
4. **Commercial use:** subscriptions or advertising would change the terms that apply to free tiers.
5. **Snapshot scope (technical option, no decision taken):** project only the data products the article *renders* into the public snapshot. That would reduce API-level exposure without changing any page, but it changes what Phase 3A stores, so it needs a decision (and a reader for older snapshots).

## Practical guidance until decided

- Keep Tiingo-backed articles unpublished, or publish only with the product owner's explicit acceptance of the warning.
- Prefer public-domain series (BLS, BEA, Treasury and Fed series on FRED, EIA) where an equivalent exists.
- Do not upgrade or purchase any subscription without approval.
