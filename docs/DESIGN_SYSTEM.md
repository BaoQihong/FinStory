# Design System — Seshat

> **Status: Phase 2A.** Tokens live in `app/globals.css` (`@theme`). Subject
> to product owner visual review (P2A-11).

## Direction

Premium editorial magazine, not a dashboard. Headline and story dominate;
data supports. Deep navy, warm cream, restrained gold; subtle Egyptian
references through geometry (seven-pointed Seshat star, measuring scale,
concentric sun-disc arcs) rather than imagery. Generous whitespace.

Reference: `docs/design/Seshat’s Bond Comeback_ Macro and Analytics.png`
(AI-generated concept art — reference only, never used as an asset).

## Typography

| Role | Face | Use |
|------|------|-----|
| Display | Fraunces (variable, opsz) | Headlines, numbers, section titles |
| Reading | Source Serif 4 | Article narrative, deks, intros |
| Interface | Inter | Navigation, labels, cards, charts |

Kicker style: Inter 12px, 700, +0.14em tracking, uppercase, gold-700.

## Colour

| Token | Hex | Use |
|-------|-----|-----|
| navy-900 / 950 | `#0f1d38` / `#0a1428` | Header, hero bands, footer, primary buttons |
| cream-100 / 50 | `#f8f2e6` / `#fdfaf3` | Page / card surfaces |
| cream-300 | `#e2d5bb` | Hairlines, card borders |
| gold-400 / 300 | `#d4a94f` / `#e6c37a` | Accents on navy only |
| gold-500 | `#b8892e` | Decorative rules |
| gold-700 | `#7f5a12` | Gold text on cream (AA) |
| ink / ink-soft / muted | `#1a2233` / `#3d4658` / `#5b6372` | Text (all ≥ 4.5:1 on cream) |

## Data visualization

- Series colours (D-022): nominal `#3158a5`, real `#b97a12`,
  breakeven/inflation `#0e968c` (always dashed), policy `#a04f9a`.
- Every chart: question as title, one-sentence takeaway, legend, direct end
  labels on wide screens, selective annotations, hover tooltip, notes,
  source links, and a "Show the data" table.
- One y-axis per chart; percent ticks; thin 2px lines; recessive grid.
- Missing observations render as gaps, never bridged.

## Evidence tags

*In the data* (green ●), *Established link* (blue ◆), *Our view* (amber ◇) —
glyph + text, never colour alone.

## Components

Indicator card · Time-series chart figure · Sparkline · Yield split
(stacked comparison) · Transmission chain · Asset implications table ·
Scenario card · Chapter navigation (desktop rail / mobile tab bar) · Story
card (+ In preparation badge) · Lead visual · Seshat mark.

## Responsive & accessibility

Mobile-first; verified at 375px with no horizontal scrolling. Skip link,
landmark structure, `aria-current` on navigation, keyboard-reachable
disclosures (`<details>`), data tables as chart alternatives,
`prefers-reduced-motion` respected.
