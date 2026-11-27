# Article generation pipeline — editorial audit (Phase 3B.2)

Audit of how Seshat produced reader-facing prose **before** the 3B.2 changes
(baseline commit `b1cdb61`). It was done before any prompt was changed. The
examples are quoted from real drafts in the studio: the published inflation
article (`cfd2cbb8…`, revision 3), the Nvidia draft (`1ea0ea22…`) and the
housing test draft (`adf41c39…`). Figures appear as they render to readers.

## 1. Pipeline map: who writes what

| Stage | Model call | Writes reader-facing prose? | Temperature | Sees |
|---|---|---|---|---|
| brief builder (optional, D-042) | Qwen3.8-27B | No (brief fields for the editor) | — | the editor's idea and guidance |
| `plan` | Qwen3.8-27B | No (central question, angle, "why readers care") | 0.3 | brief |
| `select` | Qwen3.8-27B | No | 0.2 | candidate datasets |
| `synthesize` | Qwen3.8-27B | Indirectly: writes the **thesis** every writer follows | 0.2 | brief, facts, retrieved sources |
| `story` | Qwen3.8-27B | **Yes**: headline, dek, key points, narrative | 0.6 | brief, plan core, thesis, findings, facts, charts |
| `macro_analytics` | Qwen3.8-27B | **Yes**: Macro and Analytics | 0.45 | same, plus the Story's **headline and dek only** |
| `outlook` | Qwen3.8-27B | **Yes**: Outlook | 0.5 | same, plus the Analytics **chain step titles only** |
| `review` | Qwen3.8-27B | No (fact-check findings) | 0.1 | assembled draft |
| `repair` | Qwen3.8-27B | **Yes**: rewrites flagged strings | 0.1 | flagged strings only |

One model, Qwen3.8-27B (D-008), with thinking disabled (D-009), is used for every
stage. There are eight LLM calls per article. The style instructions were one
paragraph (`VOICE`) appended to the three writing stages, plus a cliché regex
whose hits went to `repair`.

## 2. Where the human author's intent enters, and where it is lost

- **Enters:** the brief's `prompt`, `angle`, `audience`, `headline`,
  `questions`, `outlook` and `premise`. All of these reach every stage through
  `briefBlock()`.
- **There was no field for the author's own argument or voice.** The only
  view-like field, `premise`, is framed as an *"UNCONFIRMED hypothesis"* to
  verify. That framing is correct for factual assumptions, but it means the
  author's position arrives as something to be suspicious of, not something to
  argue.
- **Replaced by the model's own thesis.** `synthesize` (temperature 0.2) was
  asked for "the article's central argument … supported by the evidence". With
  no author argument to start from, it produces the consensus summary of the
  sources. Every writing stage then follows that thesis.
- **Example (Nvidia draft):** the brief's angle is *"Talk about the AI
  industry being a bubble"*. The Story ends *"The industry is at an inflection
  point. The technology is real, and the earnings are real, but the financing
  structure is fragile … the AI trade remains a story of two."* The
  opinionated angle has become an on-the-one-hand summary.

## 3. Instructions that produced formulaic prose

| Instruction (baseline) | Effect seen in drafts |
|---|---|
| `VOICE`: "Short purposeful paragraphs (2–4 sentences)" | Uniform rhythm: every Story paragraph in the inflation article is 3–4 sentences and opens with a topic sentence ("The data confirms…", "The core of the problem lies…", "This financial squeeze is visible…", "Certain categories of spending are particularly sticky.", "The impact on wealth accumulation is also becoming apparent."). |
| Story: "6 to 10 paragraphs, each making a distinct point … Cover what happened, the relevant history and context, and why it matters" | A tour of the findings list in prose, one finding per paragraph, rather than an argument developed paragraph by paragraph. |
| `VOICE`: a list of banned clichés, plus a regex-driven `repair` that "replaces clichés with plain words" | It treats the symptom: drafts still use the *shapes*, e.g. "a significant friction point in the American economy", "a complex web of hyperscalers", "balancing on a knife's edge". |
| `STORYBOARD`: Outlook = "what should investors watch?", and `watch` is a required list | Generic watch-lists, with fact tokens used as nouns. The published article's Outlook includes *"The trajectory of 4.1% and 2.9% relative to the Federal Reserve's target"* and *"Trends in −10.4% to gauge if psychological disconnect is resolving"*. |
| Implications: "If the brief names specific groups … include ONE item for EACH" | Useful for coverage, but with no "say something specific" instruction it yields boilerplate such as *"The current environment requires a reevaluation of traditional wealth-building strategies"*. |

Formulaic contrasts found despite the cliché list:

- Inflation, Outlook intro: *"The gap … is not a statistical error; it is a structural lag."* and *"the stakes involve more than just sentiment—they hinge on whether…"*
- Nvidia: *"The primary concern isn't that the technology doesn't work, but how it is being paid for."*, *"the industry is not a monolith; it is a complex web…"*, *"the question is no longer whether AI is a trend, but whether…"*, *"the key is not to predict the outcome, but to monitor…"*

## 4. Repetition across sections (the largest single problem)

Root cause: **sections are written without seeing each other.**
`macro_analytics` got only the Story's headline and dek, and `outlook` got only
the step titles of the Analytics chain. Every section is also told to "use fact
tokens", so each one re-establishes the same figures from scratch.

Inflation article (published), the same point stated repeatedly:

| Point | Where it appears |
|---|---|
| Core CPI up 20.7% over five years vs real median income up 4.6% | Story ¶3, Macro indicator note, Macro explainer "The Income-Inflation Gap", Outlook uncertainty (4×) |
| CPI index "the highest in the data since 2014" | Story ¶2, Macro intro, Macro indicator note, Macro explainer, Analytics comparison (5×) |
| S&P 500 real return "fallen by 3.75 percentage points" | Story ¶6, Analytics chain step 3, Implications item (3×) |
| "trading down … a structural shift that complicates the return to pre-inflation consumption norms" | Story ¶7, Analytics chain step 4, Outlook scenario (3×, nearly verbatim) |

The `review` stage can flag "repetition", but only near-verbatim sentences.
`repair` then rewords them; it does not remove the redundancy.

## 5. Substance issues the audit surfaced (flagged, not changed)

These are in the **published** inflation article. Under the brief they are
flagged for the editor and not edited here:

1. **Outlook watch-lists use bare figures as nouns** ("Changes in 2.6% to confirm wage growth…"). They read badly and do not name the indicator.
2. **A trivially true superlative is presented as news.** "The CPI index at 337.5, the highest in the data since 2014": a price *index* in a rising-price economy is almost always at its high. The validator verified it as true (D-041), but it carries little meaning.
3. **Possible inconsistency for an editor to check.** Scenario conditions cite "core … 2.9%" while the Story cites core PCE at 3.3%. These may be different measures (core CPI vs core PCE), but the text does not say which.
4. **Unsupported generalisation.** Chain step 5: "Consumers are saving less and investing less". No dataset or finding in the article shows saving or investment rates.
5. **Byline role.** The public byline reads "Seshat Editorial · Draft for editorial review". The role string comes from the generator default and was published as part of the approved snapshot.

The Nvidia draft also has "72% a year a year" (a repeated unit that the
deterministic de-duplication missed inside the chain step) and "a 80% market
share".

## 6. Context window and model

- The context window is **not** the constraint. The writing-stage prompts are about 8–20k tokens, against a 128k window (D-010). Incoherence comes from what each stage is *given* (section isolation, §4), not from truncation.
- Model replacement or fine-tuning is **not** indicated yet: every problem above has a prompt-level or information-flow cause. Re-evaluate after the product owner has read the revised output (see `docs/editorial/EVALUATION.md`).

## 7. Changes made in 3B.2 (no additional generation calls)

| Problem | Change |
|---|---|
| No author argument or voice | Optional brief fields `argument` and `voice` (written only by the editor; the brief builder never suggests them). The brief is now split into **EDITORIAL INTENT** and **RESEARCH DIRECTION**. |
| Model thesis replaces the author's | `synthesize` builds the thesis *from* the author's argument and adds an `authorArgument` assessment (supported / partly-supported / contradicted / untested). "Contradicted" becomes a job warning and the Story is told to set attention: the editor decides, and nothing is flattened. |
| Formulaic style and rhythm | A versioned style guide (`lib/editorial/style-guide.ts`) replaces `VOICE`. It describes the habits behind generic prose, not a list of synonyms, and drops the fixed paragraph length. |
| Findings-tour Story | The Story task is rewritten around *one argument*: a specific opening, the strongest counter-evidence handled honestly, few well-chosen figures, an ending that is an implication rather than a recap. |
| Section isolation and repetition | `macro_analytics` receives the full Story text and `outlook` the Story, Macro and Analytics summaries and the full mechanism, each with an explicit "build on, do not restate" instruction. |
| Generic Outlook | Scenario signposts must distinguish *this* scenario from the others, at least one alternative must be a path the author's argument would not predict, and the prompt says no boilerplate advice. |
| `repair` flattening voice | `repair` now carries the revision principles (keep voice and argument; rework the sentence, don't swap synonyms). |
| "Not X; it is Y" persists under the new prompts (found in evaluation round 1) | A deterministic sentence-level detector (`findFormulaicContrasts`) reports these as `style` notes, which the existing `repair` stage rewrites (no extra call). Polish receives the same detections as per-field hints. |
| Given the full Story, Macro/Analytics copied Story sentences verbatim (evaluation round 3) | Deterministic cross-section reuse check (9 or more identical consecutive words) as a `style` note for `repair`, plus an explicit no-copy instruction. Context is kept, because without it the sections restate the Story's points instead. |
| Vivid writing invented derived figures ("rates have quadrupled", "payment … more than double", found in evaluation round 1) | The style guide (v2) says concrete never means new numbers, and the number scanner now treats spelled-out multiples as figures that need a fact token (warning, then `repair`). |

The prompt is now organised as **editorial intent → editorial core (thesis) →
evidence → data → style guide → task → output fields**, so intent, evidence,
analysis, narrative, style and output format are separate blocks.
