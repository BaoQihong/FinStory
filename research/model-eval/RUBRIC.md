# Phase 3D.1 qualitative scoring rubric (fixed before any response was read)

Written 2026-11-28, before the pilot benchmark. Scores are Claude Code's
judgement of anonymised responses (labels A, B, C… per case; model identities
hidden until scoring of that case is complete). They are one reviewer's
opinion, not ground truth, and are kept separate from the deterministic
checks (answer keys, JSON/schema validity, number fidelity, latency).

Scale for every dimension: **1–5**

| Score | Meaning |
|---|---|
| 5 | Would pass a demanding senior editor with light edits; insight a good human economist/journalist would be pleased with |
| 4 | Solid, publishable after normal editing; few weaknesses |
| 3 | Competent but generic; an editor would need to add the thinking or rewrite substantial parts |
| 2 | Significant problems (errors, shallow, formulaic) — not usable without heavy rework |
| 1 | Wrong, misleading, off-task or unusable |

Rules that apply to every dimension:

- **Length and complexity are not rewarded.** A longer answer scores higher only if the extra material adds correct, relevant substance.
- **Errors cap the score.** A material factual or numerical error caps the affected dimension at 2; accepting a deliberately misleading premise caps analytical dimensions at 2.
- **Fabrication caps at 1** for the affected dimension (invented data, statistics, quotes, people, anecdotes or sources).
- A response truncated before the end is scored on what exists, and noted.
- Reasoning traces are not scored; only the final answer is.

## Tests A–D (analytical)

| Dimension | What earns a 5 |
|---|---|
| **Interpretation accuracy** (A, D) | Trends read correctly; levels vs rates and % vs pp kept distinct; units preserved; notices the missing observation |
| **Analytical depth** (A–D) | Goes beyond describing indicators to mechanisms; distinguishes supply- vs demand-driven effects; structural vs cyclical |
| **Second-order reasoning** (B, D) | Identifies non-obvious downstream effects and who bears them (renters/owners/borrowers/savers; distribution) |
| **Challenging assumptions** (B, C) | Questions the conventional reading and the supplied claims; rejects misleading premises with the right reason |
| **Epistemic discipline** (A–D) | Separates evidence from inference; correlation ≠ causation; states what the data cannot show; uncertainty where it really is (not everywhere) |
| **Testable next steps** (B, C) | Concrete hypotheses and the specific datasets that would test them |
| **Conditional reasoning** (D) | Scenarios distinct and internally consistent; invalidation conditions observable and specific; asset implications differentiated |

## Test E (editorial writing)

| Dimension | What earns a 5 |
|---|---|
| **Opening** | Starts with something specific that pulls a reader in; no scene-setting about "the economy" |
| **Narrative pacing** | Each paragraph follows from the last; varied rhythm; momentum; ending lands without recap |
| **Naturalness / voice** | Reads like a skilled human columnist; personality without strain; no fake conversational tics |
| **AI-pattern avoidance** | Free of formulaic contrasts, triads-as-rhythm, stock phrases, rhetorical-question transitions, mechanical signposting, summary endings |
| **Accessibility** | A non-specialist follows every step; finance explained in passing |
| **Substance retained** | The brief's argument, nuance (inflation fell *then* rose) and limits survive the writing |
| **Factual fidelity** | Only supplied figures, correctly attached to what they measure; no invented anecdotes, quotes or people |

The deterministic checks (unsupported numbers, unverified quotes, word
count, prose signals from `lib/editorial/signals.ts`) are reported next to
these scores, never folded into them.

## Test F (Seshat compatibility)

Not scored subjectively: graded only by the application's own rules
(JSON parse as `lib/studio/llm.ts` does, the production zod schema, unknown
fact tokens, bare numbers), first attempt and after the production repair
round.

## Aggregation

- Per test, each response gets the dimension scores above plus one **overall**
  score (not an average; a judgement of usefulness to Seshat for that task).
- Model-level figures are the mean of overall scores with the number of
  responses (n) shown. With n = 1–2 per test, differences of ≤ 0.5 are
  treated as **no evidence of a difference**.
