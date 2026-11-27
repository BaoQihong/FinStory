# Seshat editorial style guide

> **Binding text:** `lib/editorial/style-guide.ts` (`STYLE_GUIDE`, version
> `STYLE_GUIDE_VERSION`). That file is what the models read, in article
> generation (`story`, `macro_analytics`, `outlook`) and in Editorial Polish.
> Edit the wording **there** and bump the version. Each accepted Polish revision
> records the version in its revision note. This page explains the guide; it
> does not duplicate it.

## Purpose

The guide sets Seshat's *default* editorial standard: thoughtful financial
journalism and independent commentary, not an AI research summary. It does not
make every author sound the same. The author's own argument and tone notes
(brief fields **Your argument** and **Tone and voice**) take precedence over it,
within the factual rules.

## The ten principles (summary)

1. Every article argues something a reader could disagree with.
2. Open with something specific, not with "the global economy".
3. Keep the human author's argument. When the evidence complicates it, say so plainly; never suppress contrary evidence or invent support.
4. Be concrete: name the thing, the people, the mechanism.
5. Explain finance only where needed, in passing.
6. Vary sentence and paragraph rhythm. There is no fixed paragraph length.
7. Each paragraph should follow from the one before.
8. Separate fact, interpretation and conditional scenario. Hedge once, where the uncertainty actually is.
9. Personality is welcome (scepticism, curiosity, understatement). Invented anecdotes, fake experience, fabricated quotes and deliberate errors are not.
10. End on an implication or an open question, not a recap or "stay vigilant".

## What to avoid, and why it is phrased as habits

The guide lists habits rather than banned words: scene-setting openings,
reflexive "not X, but Y" contrasts, rule-of-three rhythm, em dashes as default
punctuation, manufactured drama, generic uncertainty talk, rhetorical-question
transitions, signposting, restating earlier material, abstract corporate nouns,
forced balance and bullet-point thinking. Swapping a flagged phrase for a
synonym does not fix the habit. The audit (`docs/editorial/PIPELINE_AUDIT.md`)
showed the baseline cliché list being sidestepped exactly that way.

## Section purposes

| Section | Job | Must not |
|---|---|---|
| Headline and dek | Give a reason to keep reading | Clickbait, unsupported claims, topic-summary deks |
| The Story | The argument, told as narrative | Read like an executive summary or a tour of every finding |
| Macro | The evidence that matters, interpreted | Re-tell the Story; define indicators instead of explaining why they matter here |
| Analytics | Mechanism, consequences, weak links | Repeat the Story or Macro in new words |
| Outlook | Conditional paths and the signposts that tell them apart | Boilerplate advice, generic watch-lists, false certainty |

## How the guide is used

- **Generation:** every writing stage gets the full guide plus a task block for
  its section, and sees what earlier sections already said (D-048).
- **Editorial Polish:** the guide plus the revision principles: keep voice and
  argument, add nothing, remove nothing that carries meaning (D-049).
- **Evaluation:** `npm run editorial:eval` re-runs the stored research of
  three baseline articles under the original and revised prompts. The prose
  diagnostics in `lib/editorial/signals.ts` (em dashes, formulaic contrasts,
  stock phrases, sentence-length variation, cross-section repetition) support
  a human read. They do not replace it and are not an AI-detection score.

## Changing the guide

1. Edit `lib/editorial/style-guide.ts` and bump `STYLE_GUIDE_VERSION`.
2. Run `npm test` (the tests check that the guide reaches every writing stage and Polish).
3. Optionally run `npm run editorial:eval` and read the before/after passages.
4. Record notable changes in `docs/CHANGELOG.md`.
