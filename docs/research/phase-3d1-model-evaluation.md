# Phase 3D.1 — LLM qualification, benchmarking and evaluation

Status: **complete, research only** · Date: 2026-11-28 · Author: Claude Code (technical lead)
Harness: [`research/model-eval/`](../../research/model-eval/README.md) ·
Rubric: [`RUBRIC.md`](../../research/model-eval/RUBRIC.md) ·
Generated tables: [`results/report-tables.md`](../../research/model-eval/results/report-tables.md)

Nothing in production changed. `ARLI_MODEL`, the pipeline, the prompts, the
schemas, the templates and every draft are as they were. The harness only
*reads* production prompt builders, schemas and validators. All requests ran
one at a time on the shared Arli slot (D-010).

---

## 1. Executive summary

- **There is a measurably better analyst than the production model on our own
  subscription.** **DeepSeek-V4.1-Flash** with thinking *correctly* disabled:
  - scored 15/15 on the deterministic data-reading test;
  - passed every Seshat compatibility check on all 10 production stages;
  - was the fastest model on those stages (median 34 s);
  - had the highest blind analytical/editorial score of those tested twice (4.25, n = 4).
- **MiMo-V2.6-Flash** is the strongest and fastest writer:
  - blind mean 4.25 over n = 8 responses;
  - fastest on tests A–E at a median of 30 s and 54 tokens/s;
  - wrote the best editorial piece in round 1.

  It is weak at following answer formats (8/15 on Test A, where it skipped the
  narrative part entirely) and once leaked a Chinese token into English prose.
- **The production model (Qwen3.8-27B, thinking off) ranks near the bottom on
  quality.** Its blind mean is 2.5 (n = 8). In both repetitions of the market
  outlook it broke the "no price or rate targets" rule (D-019). It is,
  however, fully compatible with the pipeline (10/10 stages parse and validate)
  and it is quick.
- **Thinking mode is not a free upgrade.** Reasoning tokens share `max_tokens`:
  - **Qwen3.8-27B with thinking on** ran away in 4 of 5 requests, even with a
    tripled budget (12,000 tokens) and 900 s timeouts.
  - **GLM-4.7 with thinking on** ran away once (13,500 reasoning tokens and no answer).
  - **DeepSeek with thinking on** was the only reliable thinker: 7/7 runs
    finished, using a median of about 2,500 reasoning tokens.
- **Each model family uses a different switch to turn thinking off.**
  DeepSeek ignores the production switch (`enable_thinking:false`) and needs
  `chat_template_kwargs.thinking:false` or `reasoning_effort:"none"`. A
  gateway that sends one switch to every model will silently pay for hidden
  reasoning.
- **Two candidates are unusable:**
  - **Qwen3.8-27B-antislop** emits garbage at every sampling setting.
  - **Gemma-Distill with thinking on** leaks chat-template tokens.
- **Every response that finished parsed and validated against the production
  zod schema.** The only failures were two truncations at `max_tokens`. The
  most common defect across models is **bare numbers in prose**, which
  production's own validator reports as warnings, not blocking errors: chiefly
  "2%" for the Fed target on the outlook and repair stages.
- **Recommendation for 3D.2 (decision for the product owner):**
  - trial DeepSeek-V4.1-Flash (thinking off) for the analytical stages, and
    MiMo-V2.6-Flash for the prose stages;
  - keep Qwen3.8-27B as the compatibility fallback;
  - run a larger replication first (section 9). The evidence is strong on
    reliability and Test A, but thin (n ≤ 8, one subject, one reviewer) on
    subjective quality.

## 2. Capability matrix (technical qualification)

**Catalog.**
- The live catalog (`results/catalog-2026-11-28T06-59-32.json`) lists 122 models.
- All 7 distinct preliminary candidates exist under their exact identifiers.
  "Current production Qwen 27B" and "Qwen3.8-27B" are the same model
  (`ARLI_MODEL`), so they were merged.
- Four models were added so that more than one family and size class is
  represented:
  - **Gemma-4-31B-it:** the base the distilled Gemma was built from, as a control.
  - **Gemma-4-31B-Writers-V2:** a writing fine-tune on a non-Qwen base.
  - **Qwen3.8-Flash-Next:** a small, fast model.
  - **MiMo-V2.6-Flash-MOPD:** a fast model from a third family.
- All are listed with a 131,072-token context.

**Qualification run.** There were 19 probes per model (220 records, plus 5
retries in `qual-2026-11-28-retry`).
- ✓ = all checks passed.
- ✗(n) = n checks failed.
- ✗400 = the request was rejected with HTTP 400. For `bad_response_format`
  that is the expected result.

| Probe | Qwen 27B | antislop | Novelist | Moxie | GLM-4.7 | DeepSeek Flash | Gemma Distill | Gemma-it | Qwen Flash-Next | MiMo Flash | Gemma Writers |
|---|---|---|---|---|---|---|---|---|---|---|---|
| basic (default reasoning) | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | no reasoning | no reasoning | ✓ | ✓ | no reasoning |
| `enable_thinking:false` off | ✓ | ✗ | ✓ | ✓ | ✓ | **ignored** | ✓ | ✓ | ✓ | ✓ | ✓ |
| `enable_thinking:true` on | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | **template leak** | ✓ | ✓ | ✓ | ✓ |
| `reasoning_effort:"low"` | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | no reasoning | ✓ | ✓ | ✓ | ✓ |
| `reasoning_effort:"none"` | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ (1-token stub) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `chat_template_kwargs.thinking:false` | does not disable | ✗ | does not disable | does not disable | ✓ | ✓ (1-token stub) | ✓ | ✓ | does not disable | does not disable | ✓ |
| system prompt / multi-turn | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| temperature 0 / top_p accepted | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `max_tokens` truncation → `finish=length` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| stop sequences | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `json_object` | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `json_schema` strict | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| streaming / streaming + thinking | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | no separate reasoning | ✓ | ✓ | ✓ | ✓ |
| ~600-token throughput | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 24k-token context needle | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| invalid `response_format` → HTTP 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |

**Other API findings:**
- **Unknown model id:** returns HTTP 404. The API does not substitute a
  different model; no echoed `model` ever differed from the one requested.
- **Reasoning field:** reasoning arrives in `reasoning`, except DeepSeek's,
  which arrives in `reasoning_content`. Reasoning never appeared inline as
  `<think>` tags in content.
- **Token counts:** `usage.completion_tokens_details.reasoning_tokens` is
  reported.
- **How to confirm thinking is really off:** DeepSeek's prompt-token count
  falls from 88 to 62 when the off switch takes effect, which makes a cheap
  verification probe.
- **Errors after HTTP 200:** Arli can answer HTTP 200 and then send an SSE
  `error` event (DeepSeek: "tensor-parallel graph completion deadline expired").
  The harness now records this as a failure.
- **Per-model outages:** HTTP 503 "No servers available for this model type"
  is intermittent and per model. Seen for DeepSeek on 5 requests and GLM-4.7
  on 1; every DeepSeek retry succeeded.
- **Determinism:** temperature 0 did not give identical outputs for GLM,
  DeepSeek, Novelist, Moxie or antislop.
- **Concurrency:** single-request concurrency (D-010) was taken as given; the
  `concurrency` probe was not run, to avoid contending with production. Long
  first-token delays (GLM up to about 120 s, Flash-Next 44 s) are consistent
  with queueing on the server side.

**Exclusions:**
- **Qwen3.8-27B-antislop:** returns token garbage ("ODAODA量大…") at every
  sampling setting, including temperature 0
  (`results/diag-antislop-2026-11-28.json`).
- **Gemma-Distill with thinking on:** produces no separated reasoning and leaks
  `<|turn>model` / `<|channel>` template tokens into content.

**Benchmark configurations.** 12 configurations went into tests A–F:
- thinking off: Qwen 27B (production), Novelist, Moxie, GLM, DeepSeek,
  Gemma Distill, Gemma-it, Qwen Flash-Next and MiMo;
- thinking on: Qwen 27B, GLM and DeepSeek;
- Gemma Writers: writing tests only.

## 3. Operational performance

All figures are end-to-end wall time from this machine, measured on the
flat-rate subscription (no per-token cost).
- **tok/s:** output tokens ÷ generation time, streaming requests only.
- **n:** all repetitions.

### Tests A–E (households fixture, ~1.0–2.7k input tokens)

| Config | n | ok | median s | max s | median out tokens | median reasoning tokens | truncated | median tok/s |
|---|---|---|---|---|---|---|---|---|
| mimo-flash | 9 | 9 | **30** | 115 | 1,528 | 0 | 0 | **53.7** |
| qwen27b (production) | 9 | 9 | 41 | 113 | 1,478 | 0 | 0 | 32.4 |
| glm47 | 5 | 5 | 50 | 172 | 1,335 | 0 | 0 | 25.1 |
| deepseek-flash | 9 | 9 | 55 | 127 | 1,271 | 0 | 0 | 28.8 |
| qwen-flash | 5 | 5 | 60 | 124 | 1,569 | 0 | 0 | 41.3 |
| gemma-distill | 5 | 5 | 63 | 79 | 1,052 | 0 | 0 | 17.3 |
| qwen-novelist | 5 | 5 | 67 | 130 | 1,105 | 0 | 0 | 21.6 |
| qwen-moxie | 5 | 5 | 67 | 95 | 1,263 | 0 | 0 | 22.9 |
| gemma-writers | 1 | 1 | 71 | 71 | 1,097 | 0 | 0 | 15.9 |
| deepseek-flash-think | 7 | 7 | 85 | 138 | 3,765 | 2,502 | 0 | 49.7 |
| glm47-think | 9 | 8 | 126 | 498 | 4,042 | 2,653 | 1 | 38.0 |
| gemma-it | 9 | 9 | 135 | 261 | 1,223 | 0 | 0 | **9.4** |
| qwen27b-think | 5 | 5 | **340** | 559 | 12,000 | 11,711 | **4** | 33.0 |

### Test F (real Seshat stages, ~8–15k input tokens, non-streaming as in production)

| Config | n | ok | median s | max s | median out tokens | truncated |
|---|---|---|---|---|---|---|
| deepseek-flash | 10 | 10 | **34** | 99 | 1,371 | 0 |
| qwen27b (production) | 10 | 10 | 47 | 72 | 1,425 | 0 |
| glm47 | 10 | 10 | 48 | 124 | 959 | 0 |
| qwen-moxie | 10 | 10 | 49 | 80 | 1,323 | 0 |
| qwen-novelist | 10 | 10 | 51 | 81 | 1,205 | 0 |
| mimo-flash | 10 | 10 | 56 | 251 | 1,293 | 0 |
| gemma-distill | 10 | 10 | 61 | **287** | 745 | 1 |
| qwen-flash | 10 | 10 | 69 | 191 | 1,582 | 1 |
| gemma-writers | 10 | 10 | 71 | 183 | 780 | 0 |
| gemma-it | 10 | 10 | 81 | 144 | 970 | 0 |

"ok 10/10" for DeepSeek and Gemma-Distill counts the retries:
- **DeepSeek, macro_analytics:** HTTP 503 at first, then succeeded on retry.
- **Gemma-Distill, macro_analytics:** timed out twice at 300 s, then finished
  in 287 s with a 900 s timeout.

**Production timeout.** Production's per-stage timeout should be checked
against Gemma-class latencies before any Gemma model is considered.

**Reading the numbers.**
- **Latency is dominated by output length and queueing, not model size.**
  The two "Flash" models are not consistently faster than the 27B (Qwen
  Flash-Next is slower on Test F).
- **Thinking roughly doubles latency (DeepSeek) or worse (GLM),** and makes
  latency unpredictable.
- **Variance is high.** With n = 5–10, the maximum latencies matter more for a
  production timeout than the medians do.

## 4. Quality matrix

### Objective results (deterministic; answer keys computed from frozen FRED data)

Two values in a cell are rounds 1 and 2.

| Config | A: answers correct | B: format | C: verdicts | D: checks | E: checks |
|---|---|---|---|---|---|
| deepseek-flash | **15/15** | ✓ ✓ | 10/10, 10/10 | 7/7, 7/7 | 7/8, 7/8 |
| deepseek-flash-think | **15/15** | ✓ ✓ | 10/10, 10/10 | 6/7, 6/7 | – |
| glm47-think | **15/15** | ✓ ✓ | 10/10, then empty | 6/7, 6/7 | 6/8, 503 |
| qwen-flash | **15/15** | ✓ | 10/10 | 7/7 | 6/8 |
| gemma-it | 13/15 | ✓ ✓ | 10/10, 10/10 | 7/7, 6/7 | 6/8, 6/8 |
| qwen-novelist | 10/15 | ✓ | 10/10 | 7/7 | 7/8 |
| gemma-distill | 10/15 | ✓ | 10/10 | 7/7 | 7/8 |
| qwen27b (production) | 9/15 | ✓ ✓ | 10/10, 10/10 | 7/7, 6/7 | 6/8, 6/8 |
| glm47 | 9/15 | ✓ | 10/10 | 7/7 | 7/8 |
| qwen-moxie | 9/15 | ✓ | 10/10 | 6/7 | 7/8 |
| mimo-flash | 8/15 (narrative part omitted) | ✓ ✓ | 10/10, 10/10 | 7/7, 7/7 | 7/8, 7/8 |
| gemma-writers | – | – | – | – | 6/8 |
| qwen27b-think | 0/15 (truncated) | 1/2 | 10/10 | 2/7 | 4/8 |

**What the tests measure:**
- **Test A** asks for 12 computed answers (12-month changes, a missing
  observation, % vs percentage points, correlations) and 3 structural checks.
  It discriminates well. Every thinking-on model that finished scored 15/15,
  and DeepSeek scored 15/15 even with thinking off.
- **Test C** verdicts do not discriminate: every finished response rejected
  the misleading premises. Its value is in the quality of the reasoning, which
  is scored below.
- **Test E checks:** the usual misses are unsupported numbers, word count
  (900–1,200) and invented or unverified quotes. Prose signals are
  informational. None of these is folded into the scores.
- **Test D `no_targets` check:** a regex heuristic that misfires both ways.
  - It flags quoted table values ("hit 4.17%").
  - It missed the production model's round-1 S&P targets.

  For D-019 compliance, the blind review is authoritative.

### Test F: Seshat compatibility, by stage

Production rules applied:
- JSON parsed as `lib/studio/llm.ts` parses it;
- the production zod schema;
- unknown fact tokens;
- bare numbers, using `findBareNumbers`;
- one production repair round.

| Stage | qwen27b | novelist | moxie | glm47 | deepseek | g-distill | gemma-it | qwen-flash | mimo | g-writers |
|---|---|---|---|---|---|---|---|---|---|---|
| plan / select / brief / review / polish | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| synthesize | ✓ | ✓ | ✓ | ✓ | ✓ | truncated → repair ✗ | ✓ | ✓ | ✓ | ✓ |
| story | bare | ✓ | bare | ✓ | ✓ | ✓ | bare | truncated → repair JSON ✓, bare | ✓ | bare |
| macro_analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | bare | ✓ | ✓ |
| outlook | bare, no tokens | bare, no tokens | bare, no tokens | bare, no tokens | ✓ | no tokens | ✓ | bare | ✓ | bare |
| repair | bare | bare | ✓ | bare | ✓ | ✓ | ✓ | ✓ | bare | ✓ |
| **all checks** | 41/45 | 42/45 | 42/45 | 42/45 | **all** | 42/45 | 44/45 | 37/41 | 44/45 | 43/45 |

**How to read the Test F table:**
- **"bare"** is mostly "2%" (the Fed target) or a figure copied from the data
  as text instead of as a fact token. Production's validator
  (`lib/studio/validate.ts`) raises the same thing as a **warning**, so these
  outputs would not be blocked. Editors would still have to fix them before
  publication.
- **"no tokens"** means the outlook used no fact tokens at all. That is
  acceptable under D-019 only if the outlook is figure-free, which these were
  not.

**Summary:** DeepSeek is the only model that passed every Test F check on
every stage. Gemma-it and MiMo come next.

### Subjective results (blind, rubric fixed before reading; one reviewer)

The overall score per response is 1–5. Round 1 covered all 12
configurations; round 2 covered the six leading configurations plus production.

| Config | Round 1 B/C/D/E | Round 2 B/C/D/E | Mean (n) |
|---|---|---|---|
| deepseek-flash | not blind-scored | 4 / 5 / 4 / 4 | **4.25 (4)** |
| mimo-flash | 5 / 5 / 4 / 4 | 5 / 4 / 4 / 3 | **4.25 (8)** |
| deepseek-flash-think | 4 / 4 / 4 / – | 4 / 4 / 4 / – | 4.00 (6) |
| glm47-think | 3 / 4 / 4 / 3 | 3 / **1** / 3 / – | 3.00 (7) |
| gemma-it | 4 / 3 / 3 / 3 | 3 / 3 / 2 / 3 | 3.00 (8) |
| qwen-moxie | 3 / 4 / 3 / 3 | – | 3.25 (4) |
| qwen-flash | 3 / 3 / 4 / 3 | – | 3.25 (4) |
| gemma-distill | 4 / 3 / 3 / 3 | – | 3.25 (4) |
| qwen-novelist | 4 / 3 / 2 / 3 | – | 3.00 (4) |
| gemma-writers | – / – / – / 3 | – | 3.00 (1) |
| glm47 | 3 / 3 / 2 / 3 | – | 2.75 (4) |
| **qwen27b (production)** | 2 / 3 / 2 / 2 | 2 / 4 / 2 / 3 | **2.50 (8)** |
| qwen27b-think | 1 / 4 / 1 / 1 | – | 1.75 (4) |

**Where the rubric draws its lines:**
- Under the rubric, differences of 0.5 or less are not evidence of a difference.
- The gaps that survive are:
  - the top group (DeepSeek, MiMo, DeepSeek with thinking) against the
    production model, a gap of 1.5–1.75;
  - the top group against everything else, with weaker evidence (n = 4).
- **The production model's low score is consistent across both rounds.** Its
  recurring problems:
  - a data error that the argument then rests on;
  - price/rate/S&P targets in the outlook in *both* rounds, a direct breach of
    D-019's rules;
  - formulaic editorial prose.

**Per-response notes:** [`samples/households-v1/SCORES.md`](../../research/model-eval/samples/households-v1/SCORES.md)
and [`samples/households-v1-rep2/SCORES.md`](../../research/model-eval/samples/households-v1-rep2/SCORES.md).

## 5. Per-model profiles (with excerpts)

Excerpts are verbatim final answers, taken from the anonymised samples.

**DeepSeek-V4.1-Flash, thinking off: best analyst.**
- **Strengths:**
  - 15/15 on Test A;
  - every Test F check passed;
  - accurate figures;
  - asks the right next question.
- **Weaknesses:**
  - intermittent 503s;
  - the thinking-off switch differs from the other models' (section 2);
  - one data slip per long answer.

> "The key inference: the *average* household is not the *marginal* household. The marginal household is a renter or recent buyer with floating-rate debt and no cushion — and that household is a small share of GDP but a large share of the sentiment survey." (B, round 2)

> "Inflation falling was never the same thing as prices falling. The gap between the two explains why households feel worse off than the pay figures suggest — and it is widening again." (E standfirst, round 2)

**MiMo-V2.6-Flash, thinking off: best writer, fastest.**
- **Strengths:**
  - highest round-1 scores on B, C and E;
  - precise on the claims test: it spotted that most of the mortgage decline
    preceded the first rate cut;
  - fastest model on A–E.
- **Weaknesses:**
  - minimal compliance with format instructions: on Test A it returned only
    the answers block, in 124 tokens;
  - in round 2 it leaked a Chinese token ("drawing down缓冲");
  - bare "2%" in the repair stage.

> "Households noticed the second number more than the first, and they were right to. But the deeper reason people feel poorer has little to do with which way the rate is moving. It has to do with where the level stopped." (E, round 1)

> "The mortgage rate did fall from 6.92% (June 2024) to 6.18% (September 2024), but most of that decline happened *before* the September cut" (C, round 2, same finding in round 1)

**DeepSeek-V4.1-Flash, thinking on: reliable thinker.**
- **Strengths:**
  - 7/7 finished;
  - about 2,500 reasoning tokens per answer;
  - consistent 4s on B, C and D;
  - the most data-anchored invalidation conditions in the outlook.
- **Weaknesses:**
  - about 1.5× the latency of thinking off;
  - no measured quality gain over thinking off on this sample;
  - dense prose.

> "Invalidate if core CPI falls below 2.45% and CPI below 3.3% while unemployment stays at or below 4.2% (upside), or if CPI moves above 4.17% and core above 2.82% while the funds rate moves above 3.88% (downside)." (D, round 2)

**Qwen3.8-27B, thinking off: production baseline.**
- **Strengths:**
  - fully pipeline-compatible;
  - quick on Test F (47 s median);
  - claims test sound.
- **Weaknesses:**
  - D-019 breaches in the outlook in both rounds;
  - material data errors in B;
  - formulaic E prose.

> "The S&P 500 breaks above 8,000 as discount rates fall… Mortgage rates exceed 8.0%." (D, round 2: forbidden targets, invented)

> "the Federal Reserve has held the effective federal funds rate steady at 3.63% for five consecutive months" (D, round 2: the table shows 3.75% and 3.88%)

**Qwen3.8-27B, thinking on: not viable.**
- Reasoning consumed the budget in 4 of 5 requests (11.7k median reasoning
  tokens, median 340 s).
- The one finished answer (C) was good.

**GLM-4.7, thinking off and on:**
- **Thinking off:** competent but generic; 9/15 on Test A.
- **Thinking on:**
  - 15/15 on Test A and solid on the outlook;
  - but in round 2 it ran away once (C: 13,500 reasoning tokens, no answer);
  - it had the worst first-token delays observed (about 120 s);
  - it was unavailable (503) for one request.

> "This combination suggests that the economy is not merely slowing; it is undergoing a structural sh[ift]…" (B, round 1: the typical register)

**Gemma-4-31B-it:**
- **Strengths:**
  - 13/15 on Test A;
  - 44/45 on Test F.
- **Weaknesses:**
  - the slowest generator by far (9.4 tok/s; 135 s median on A–E);
  - generic analysis;
  - in round 2 it misread the yield curve as "steepening" when it had flattened.

**Gemma-4-31B-Distill, thinking off:**
- **Quality:** reasonable B, mid-table elsewhere; 10/15 on Test A.
- **Reliability:**
  - truncated JSON on synthesize, still broken after the production repair round;
  - one 287 s response.
- The thinking-on variant was excluded.

**Gemma-4-31B-Writers-V2 (writing tests only):**
- Clean and accessible, but its E piece was not distinctive (3).
- Bare numbers in story and outlook.

> "But households do not live inside a rate of change. They live with the price level." (E, round 1)

**Qwen3.8-27B Novelist and Moxie (fine-tunes of the production base):**
- They score 3.0–3.25: marginally above the base model, not near the top
  group.
- The creative fine-tune did not produce better editorial writing on this test.
- They share the base model's outlook behaviour: bare "2%" and no fact tokens.

> "The headline pattern … is internally consistent with at least three different stories, and the data above cannot yet tell us which one is true." (Novelist, B, round 1: a good opening, followed by generic content)

**Qwen3.8-Flash-Next:**
- 15/15 on Test A (2.3k output tokens: it shows its working).
- Mid-table on quality.
- Truncated JSON on story; slower than its name suggests (69 s median on Test F).

## 6. Direct comparisons

| Question | Finding | Strength of evidence |
|---|---|---|
| Thinking on vs off, same weights | **DeepSeek:** no quality gain (4.0 vs 4.25), 1.5× latency. **GLM:** gain on Test A (15 vs 9) and D, but runaway risk. **Qwen 27B:** catastrophic (runaway). | Strong for Qwen; moderate for the others |
| Fine-tune vs base: Qwen 27B → Novelist, Moxie | +0.5 to +0.75 over production; no change in Test F behaviour | Weak (n = 4) |
| Fine-tune vs base: Gemma-it → Distill, Writers | Distill comparable on quality, less reliable (truncation, 287 s); Writers no better than base on E | Weak |
| Fast vs large | MiMo (fast) is the best writer; Qwen Flash-Next ≈ mid-table; "Flash" does not reliably mean lower latency on long prompts | Moderate |
| Production vs best alternative | Production 2.5 vs DeepSeek/MiMo 4.25; production 9/15 vs DeepSeek 15/15 on Test A; Test F parity on parsing, DeepSeek cleaner on prose rules | Strongest finding in the study, still one subject |
| Determinism | No model at temperature 0 is reliably repeatable; rerunning a stage is not a reproducibility tool | Strong |

## 7. Role recommendations

These are recommendations for the 3D.2 decision, not changes. Production
selection stays as it is until the product owner approves a change.

| Pipeline role (stages) | Recommended | Alternative | Avoid |
|---|---|---|---|
| Analytical: plan, select, synthesize, macro_analytics, outlook | **DeepSeek-V4.1-Flash, thinking off** (`chat_template_kwargs.thinking:false`) | DeepSeek with thinking on, for synthesize/outlook if a latency budget allows | Qwen 27B thinking on; GLM thinking on (runaway) |
| Editorial prose: story, polish | **MiMo-V2.6-Flash, thinking off**, with a non-Latin-script output check | DeepSeek-V4.1-Flash | Writing fine-tunes (no gain shown) |
| Structured utilities: brief, review, repair | DeepSeek-V4.1-Flash or Qwen3.8-27B (all pass) | MiMo (bare "2%" in repair) | Gemma family (latency) |
| Fallback when the primary model returns 503 | **Qwen3.8-27B** (production-proven, fully compatible) | — | Silent substitution without logging |
| Exclude | Qwen3.8-27B-antislop; Gemma-Distill thinking on | | |

**Shortlist to carry into 3D.2 (four configurations):**
1. DeepSeek-V4.1-Flash, thinking off;
2. MiMo-V2.6-Flash, thinking off;
3. DeepSeek-V4.1-Flash, thinking on;
4. Qwen3.8-27B (the baseline and fallback).

## 8. Architectural observations for 3D.2

**Audit of the current implementation (unchanged).** `lib/studio/llm.ts`:
- calls one model (`ARLI_MODEL` = Qwen3.8-27B) with
  `chat_template_kwargs.enable_thinking:false`;
- uses non-streaming requests;
- sends `response_format` `json_schema` strict, falling back to `json_object`
  on HTTP 400;
- validates with zod;
- allows one repair round with feedback.

All 10 configurations accepted strict `json_schema`, so the fallback path was
never exercised in Test F.

Observations for the gateway design:

1. **Thinking controls are per model, so they belong in model configuration,
   not in the call site.**
   - Qwen family: `enable_thinking`.
   - DeepSeek: `thinking` or `reasoning_effort:"none"`.
   - Gemma: no real reasoning.

   A gateway should verify the effect at start-up: a 1-token probe, comparing
   prompt-token deltas and `reasoning_tokens`.
2. **Reasoning shares `max_tokens` and can run away.** Thinking-on calls need:
   - an explicit reasoning budget (`reasoning_effort` was accepted by every
     model) or a separate cap;
   - a per-stage wall-clock timeout;
   - a rule for what happens when `finish=length` arrives with empty content.
3. **Treat these as failures:**
   - HTTP 200 followed by an SSE `error` event;
   - an empty `choices` array;
   - `finish=length` with empty content.

   Production uses non-streaming requests, so the SSE case matters only if
   streaming is introduced.
4. **HTTP 503 "No servers available" is per model and transient.** That calls
   for:
   - a retry with backoff on the *same* model;
   - then an explicit, logged fallback to a named secondary model, decided by
     configuration (never silent).
5. **Latency is heavy-tailed** (Gemma-Distill: 287 s on one stage). Timeouts
   should be set per stage from measured p95/max, not one global value.
   Single-request concurrency means a slow model blocks every other job.
6. **Output sanity checks belong in the gateway:**
   - non-Latin script in English output (MiMo);
   - chat-template tokens (Gemma-Distill);
   - repetitive garbage (antislop).
7. **Bare-number warnings cluster on policy constants** such as the Fed's "2%"
   target. Either the fact system provides a token for policy targets, or the
   prompts say explicitly how to express them. This is a product decision,
   not changed here.
8. **Reuse:** the harness's `Case`/`Check`/`RecordRow` types, the frozen
   fixtures and the Test F evaluators have no dependency on the HTTP client. A
   gateway can replay the same cases and compare against these baselines.

**Issues found in passing (reported, not fixed: out of scope):**
- **Quote extraction:** the verified Zandi quote in the production quote store
  is undated ("Tuesday's CPI report") and contains the words "Zandi said".
  Several models therefore presented it as commentary on the 2026 data.
- **`factsForSeries` in `lib/studio/facts.ts`** takes the "year-ago" value as
  the last observation *on or before* 12 months earlier. When that month is
  missing, `…Chg1y` silently spans 13 months while still being labelled one
  year (seen for `cpiHeadlineChg1y` with the missing October 2025 CPI).
- **Out-of-scope work in the tree:** the working tree contains uncommitted,
  pre-existing gateway work that was not part of this phase and was not
  touched:
  - `lib/model-gateway/`, `scripts/model-gateway/`, `docs/MODEL_GATEWAY.md`,
    `docs/benchmarks/`, `scripts/benchmarks/`;
  - edits to `package.json` and `docs/ROADMAP.md`.

  The product owner should decide what to do with it before 3D.2.

## 9. Limitations

- **Small samples:**
  - one subject (households-feel-poorer);
  - n = 1–2 per test per model for the subjective scores;
  - n = 1 per stage for Test F.

  Differences of 0.5 or less are noise.
- **One reviewer, and an AI one.** Claude Code scored blind against a fixed
  rubric, but the reviewer is itself an LLM, and its taste may favour some
  styles. A human editor should score a subset before any switch.
- **Deviations from the rubric:**
  - Test A's narrative part was graded on the answer key only.
  - The corrected DeepSeek-off round-1 responses were run after the round-1
    blind set had been made, so they were not blind-scored (DeepSeek-off
    has n = 4).
  - One empty round-2 response was unblinded to diagnose it (the score is
    mechanical).
- **Missing data in round 2:** the glm47-think E response is missing
  (persistent 503).
- **Thinking budgets:** thinking-on budgets were 3× the base `max_tokens`.
  Other budgets, or `reasoning_effort` low/medium, were not benchmarked.
- **Not tested:**
  - output tok/s on Test F, because it is non-streaming;
  - concurrency;
  - time-of-day effects. All runs were on one day, so latency reflects that
    day's load.
- **Test design:** Test C verdicts and the Test F JSON checks saturated, so
  they do not separate the leading models.
- **Fixture caveats:** the undated quote in the E and F fixtures (section 8).

## Rerun

```bash
node research/model-eval/run.ts qual                                   # qualification
node research/model-eval/run.ts bench --suites A,B,C,D,E --configs <ids> --run <runId> [--reps 2]
node research/model-eval/run.ts bench --suites F --configs <ids> --subject households-feel-poorer --run <runId>
node research/model-eval/aggregate.ts <runId> [<runId> …]
node research/model-eval/anonymize.ts <runIds…> --suites B,C,D,E [--rep 2] --out samples/<name>
node research/model-eval/report-tables.ts > research/model-eval/results/report-tables.md
```

Run directories used:
- `qual-2026-11-28`, `qual-2026-11-28-retry`;
- `pilot-households`, `bench-households`;
- `bench-households-deepseek-ineffective-off`: evidence of the ignored switch;
  excluded from the results;
- `f-households`.

Thinking runs used `--timeout 900000 --retries 0`. Details are in the
harness [README](../../research/model-eval/README.md).
