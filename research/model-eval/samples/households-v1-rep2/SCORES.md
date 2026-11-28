# Blind scores — households-v1, repetition 2

Scored 2026-11-28 against [`RUBRIC.md`](../../RUBRIC.md), before the key was
opened. One exception: response C/F was empty, so its label was unblinded to
find the cause (glm47-think spent the full 13,500-token budget on reasoning and
returned no answer — scored 1 mechanically, not a quality judgement). glm47-think
has no E response (HTTP 503 "no servers available" on retry).

Overall score per response (1–5), with the main reasons. Numbers were checked
against the frozen fixture tables.

## B1 — macroeconomic reasoning

| Label | Overall | Notes |
|---|---|---|
| A | 5 | Correct figures throughout (ex-post real rate 1.65%, 74.0→52.2 ≈ 30%); stock-vs-flow point on unemployment; seven specific hypotheses with named datasets (sub-indices, Atlanta Fed tracker, DFA) |
| B | 4 | Strong mechanisms ("the average household is not the marginal household"); one data error (sentiment 66.4 attributed to January — it is July 2024) |
| C | 3 | Correct but generic; "bear steepening" and saving-rate reading loose; vague datasets |
| D | 2 | Invents falling asset prices (no asset data in table); "22 points" is 19.5; "refinancing rate near 100%" is confused |
| E | 3 | Readable; misreads lower saving rate as drawing down savings; PCE-by-quintile attributed to BLS (BEA); "Fed's recent hikes" |
| F | 4 | Best challenge to the premise (policy may be only mildly restrictive); broad hypothesis set with datasets; minor error (10-year below funds rate is not true in June 2025) |

## C1 — quantitative claims (all verdict blocks 10/10 except F)

| Label | Overall | Notes |
|---|---|---|
| A | 5 | Precise: notes most of the mortgage decline preceded the September cut; correct confounders; right tests |
| B | 3 | C5 prose says "not supported" but block says "insufficient evidence"; C3 overclaims ("contradicted") |
| C | 4 | Sound, concise; remedies generic |
| D | 4 | Good; uses the two-quarter GDP rule (not the US/NBER definition) |
| E | 4 | Thorough and correct; long |
| F | 1 | Empty — reasoning consumed the whole budget (finish=length) |

## D1 — market outlook

| Label | Overall | Notes |
|---|---|---|
| A | 2 | Calls the curve "steepening" (2s10s narrowed 0.54→0.39); generic asset bullets; no mention of missing data |
| B | 4 | Accurate narrative of the table; differentiated asset implications; specific invalidations; notes the missing observations |
| C | 3 | Data mostly right; gives an S&P "toward 7,600" level (rule breach, and below the current level) |
| D | 4 | Disciplined: no targets, flags what the table cannot show (dollar, foreign rates); somewhat generic |
| E | 2 | Says the funds rate was held at 3.63% for five months (it rose to 3.88%); many rate/price targets (S&P 8,000, mortgage 8%) despite the rule; invents "shelter and services" |
| F | 4 | Most data-anchored invalidation conditions; notes missing data; dense; "44.8%" unit slip |

## E1 — editorial feature

| Label | Overall | Notes |
|---|---|---|
| A | 3 | Competent, correct figures; "dipping into reserves" misreads the saving rate; some formulaic transitions |
| B | 4 | Best voice and structure; correct on saving less vs dissaving; "Our reading is…" separates inference; one unsupported flourish ("most quoted number") |
| C | 3 | Heavy metaphor ("speedometer", "running on fumes", "long winter", "altitude"); two H1 lines; correct numbers |
| D | 3 | Strong argument and nuance, but a leaked Chinese token ("drawing down缓冲") and an unsupplied "lowest since at least 2016" claim |

## By configuration (rep 2)

| Config | B | C | D | E | Mean (n) |
|---|---|---|---|---|---|
| deepseek-flash | 4 | 5 | 4 | 4 | 4.25 (4) |
| mimo-flash | 5 | 4 | 4 | 3 | 4.00 (4) |
| deepseek-flash-think | 4 | 4 | 4 | – | 4.00 (3) |
| gemma-it | 3 | 3 | 2 | 3 | 2.75 (4) |
| qwen27b (production) | 2 | 4 | 2 | 3 | 2.75 (4) |
| glm47-think | 3 | 1 | 3 | – | 2.33 (3) |
