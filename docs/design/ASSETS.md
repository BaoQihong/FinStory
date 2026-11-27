# Asset attribution record

Every third-party image, font or illustration used in the public site must
be listed here with creator, original URL, licence and required attribution
**before** it ships. AI-generated imagery is never permitted (D-020).

## Images

None. Phase 2A uses no photography or third-party illustrations. All
visuals are typography, CSS/SVG geometry drawn in this repository
(`components/site/SeshatMark.tsx`, `components/editorial/HeroPattern.tsx`,
`app/icon.svg`, `components/article/AssetIcon.tsx`) and charts rendered
from FRED data.

| Asset | Creator | Source URL | Licence | Attribution required |
|-------|---------|------------|---------|----------------------|
| — | — | — | — | — |

## Fonts

Self-hosted at build time via `next/font/google`.

| Font | Licence |
|------|---------|
| Fraunces | SIL Open Font License 1.1 |
| Source Serif 4 | SIL Open Font License 1.1 |
| Inter | SIL Open Font License 1.1 |

## Data

Federal Reserve Economic Data (FRED), Federal Reserve Bank of St. Louis —
series DGS10, DFII10, DFF, CPILFESL, A191RL1Q225SBEA. Cited on every chart
and in each article's Sources section.

## Reference material (not published)

`docs/design/Seshat’s Bond Comeback_ Macro and Analytics.png` — AI-generated
concept mockup supplied by the product owner. Visual reference only; must
not be served by the site or cropped into assets.
