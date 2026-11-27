# Phase 3B.2 editorial evaluation

> **For the product owner's judgment.** This is evidence, not a verdict:
> whether the prose is better is an editorial call. Raw output (every
> paragraph of every variant, Polish proposals and check results) is in
> `docs/editorial/evaluation/results.json`. Reproduce with
> `npm run editorial:eval`.

## Method

- **Same inputs:** for each article the job's *stored* stage outputs were
  reloaded: the same brief, research sources, findings, datasets, facts and
  model (Qwen3.8-27B, production temperatures). Only the writing prompts
  differ. The **original** prompts were taken verbatim from commit `b1cdb61`.
  The **revised** prompts are this phase's.
- **Articles (three categories):** the published inflation article (consumer
  macro; Story, Macro + Analytics and Outlook regenerated), US housing (market
  or asset analysis; Story) and Nvidia / AI bubble (opinionated commentary;
  Story, plus one variant with a stand-in author argument).
- **Editorial Polish** was run on each article's *current* stored prose.
- **Nothing was written to any draft.** The live article was read, never
  modified. Usage was recorded under `api_usage.stage = 'evaluation'`.
- **Rounds:**
  - Round 1: original vs revised prompts, plus Polish v1.
  - Round 2: Polish v2, with the line-edit instruction and detector hints.
  - Round 3: revised prompts with style guide v2, plus Polish v3, after the fixes that rounds 1–2 motivated (D-052).
- **Limits:** one sample per variant. Differences are indicative, not
  statistically established. Generation outputs here are *pre-repair*: the
  production `review` and `repair` stages run afterwards and would fix bare
  numbers and the style notes reported below.
- **Cost:** 29 Arli calls in total (15 + 4 + 10), about 278k prompt and 34k
  completion tokens, about 38 minutes wall-clock. Arli was slow during the
  run (27–184 s per call).

## Diagnostics (Story section, tokens resolved)

The counts below are not quality or AI-detection scores. CV is the coefficient
of variation of sentence or paragraph length (higher = less uniform rhythm).
"Contrasts" counts the "not X; it is Y" family.

| Variant | Words | Sentence CV | Paragraph CV | Em dashes /1k | Contrasts | Stock phrases |
|---|---|---|---|---|---|---|
| **Inflation**, original prompts | 544 | 0.37 | 0.26 | 3.7 | 2 | 1 |
| Inflation, revised (final) | 544 | 0.47 | 0.39 | 0 | 2 | 0 |
| **Housing**, original prompts | 629 | 0.45 | 0.29 | 0 | 2 | 1 |
| Housing, revised (final) | 523 | 0.38 | 0.29 | 0 | 2 | 0 |
| **Nvidia**, original prompts | 547 | 0.28 | 0.26 | 3.7 | 0 | 3 |
| Nvidia, revised (final) | 588 | 0.47 | 0.11 | 0 | 2 | 2 |
| Nvidia, revised + stand-in argument (round 1) | 509 | 0.43 | 0.09 | 0 | 5 | 1 |

Whole inflation article (Story + Macro/Analytics + Outlook):

| | Original prompts | Revised (final) |
|---|---|---|
| Outlook watch items that are bare figures ("The gap between 2.9% and 2.6%") | 2 of 6 | **0 of 9** |
| Fact tokens restated across sections | 7 | 5 |
| Mechanism-chain passages copying Story wording verbatim | 0 | **6** (see finding 4) |

## Findings

**1. The argument is clearer and the openings are stronger, in all three articles.**
The revised Stories open on the claim, not the scene, and hold one line of
argument.

> Original (inflation): *"There is a growing disconnect between what the
> inflation data says and what the average American feels at the checkout
> counter."*
>
> Revised (inflation): *"The news is that inflation is coming down. The reality
> is that everything still feels expensive. … But the rate of change is a
> snapshot, not the bill."*

> Original (Nvidia): *"For the average retail investor, the question of whether
> artificial intelligence is a bubble has shifted from a theoretical debate to a
> portfolio reality."*
>
> Revised (Nvidia, round 1): *"Nvidia just posted a quarter that would have
> looked like fiction a decade ago. … For a retail investor, this is the part of
> the AI story that feels most real."* It ends *"The next sign that the bubble is
> real won't be a drop in Nvidia's stock price; it will be a slowdown in the
> capital expenditure of the companies buying its chips. Watch that number, not
> the headlines."*

**2. The author's-argument field works.** With a stand-in argument ("the money
is real, but suppliers funding their own customers is how bubbles hide"), the
Nvidia Story was built around it from the headline on ("The AI Boom's Hidden
Plumbing Problem"). Without it, the revised prompt still produced a more
committed piece than the original ("a story of two" became an argument about
financing risk). The stand-in was written for the test and is labelled as such.

**3. The "not X; it is Y" habit survived the prompt change.** The counts do not
fall. Qwen3.8-27B reaches for the construction even when told not to ("That gap
is not a rounding error; it is…", "This disconnect is not merely statistical;
it is psychological"). Response (D-052): a deterministic detector now feeds
these to `repair` and to Polish. This is the clearest sign of a **model-level
tendency**; see the recommendation below.

**4. Giving later sections the full Story reduced re-explanation, but caused
copying.** In round 3, Macro/Analytics lifted whole Story sentences into the
mechanism chain (6 passages; 0 under the original prompts). Response: a
cross-section verbatim-reuse check feeds `repair`, plus an explicit no-copy
instruction. The Outlook, which got summaries rather than full text, improved
cleanly: its signposts name indicators instead of bare figures.

**5. A push for concreteness produced invented derived figures (fixed).** Round
1 housing: *"Mortgage rates have quadrupled since 2021"* (the data says 3.10% →
7.21%) and *"The monthly payment … is now more than double"*. The style guide's
own example had been about monthly mortgage payments. Response: guide v2 says
concreteness never licenses new numbers, and spelled-out multiples now count
as figures that need a fact token. Round 3 housing has no invented multiples.
Separately, the round-3 Nvidia headline contains "$1.5 Trillion", which is not
a fact token. The validator flags it as a bare number for `repair`.

**6. Editorial Polish is safe, and useful on weaker drafts but timid on the
published one.**

| Article (current prose) | Fields | Changed v1 → v2 → v3 | Clean / flagged / rejected (v3) |
|---|---|---|---|
| Inflation Story | 11 | 1 → 1 → 2 | 2 / 0 / 0 |
| Inflation Outlook | 7 | 0 → 3 → 2 | 2 / 0 / 0 |
| Housing Story | 12 | 2 → 9 → 8 | 6 / 2 / 0 |
| Nvidia Story | 12 | 4 → 5 → 6 | 5 / 1 / 0 |

- **Protection held in every run:** no proposal changed a fact token, number,
  date, quotation or source reference. Flags were the intended "check"
  notes, e.g. *"−must"* in "one must look at" → "comes down to".
- **Good edits:** *"The 'lock-in effect' is not just a theory; it is a
  structural barrier…"* → *"The 'lock-in effect' acts as a structural barrier
  to supply…"*; *"For the average reader, the stakes are high."* (deleted);
  *"the stakes involve more than just sentiment—they hinge on…"* → *"the
  question is whether…"*.
- **Weak edits:** *"inflection point"* → *"crossroads"* (a synonym swap, which
  the guide says not to do); *"not a statistical error; it is a structural
  lag"* → *"a structural lag, not a statistical error"* (the same contrast,
  reordered). On the published inflation article Polish stays light: it
  changes 2 of 11 Story fields and leaves the structure alone.
- **Concern raised, not applied (v1):** the published Story calls the CPI level
  "a historic high", an unsupported superlative (D-033 bans "record/all-time"
  for the same reason). This is a real issue in the live text, flagged for you.
- **Cost per section:** about 6–9.5k prompt and 0.6–1.1k completion tokens;
  30–60 s typical (one 184 s outlier under Arli load).

## Assessment and recommendation

- **What the changes achieve:** a clearer authorial line, better openings,
  fewer stock phrases and em dashes, more varied rhythm, an Outlook that
  names what to watch, author-argument support, and a review-first Polish that
  never touched protected content.
- **What they don't (yet):** the "not X; it is Y" habit is stable at the model
  level; full-context sections copy; Polish is conservative on prose that is
  already clean but generic. The deterministic safeguards (D-052) address the
  first two through the existing `repair` stage. They were verified by unit
  tests and against these outputs, but **not yet in a full live pipeline
  run**.
- **Recommendation:**
  1. Read the passages above and in `results.json`, and run one real story through the studio with **Your argument** filled in.
  2. If the contrast habit and generic phrasing still bother you after `repair`, the next step is a **controlled model comparison** (same stored inputs, a stronger instruction-following model on Arli or elsewhere), run through this same script. That needs your approval because it may involve cost.
  3. Fine-tuning is not indicated.
