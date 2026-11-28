## Qualification (✓ all checks pass · ✗(n) n checks failed · ✗NNN HTTP status)

| Case | Qwen3.8-27B | Qwen3.8-27B-antislop | Qwen3.8-27B-Novelist1.0 | Qwen3.8-27B-Moxie | GLM-4.7 | DeepSeek-V4.1-Flash | Gemma-4-31B-Distill | Gemma-4-31B-it | Qwen3.8-Flash-Next | MiMo-V2.6-Flash | Gemma-4-31B-Writers-V2 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| basic_default | ✓ | ✗(2) | ✓ | ✓ | ✓ | ✓ | ✗(1) | ✗(1) | ✓ | ✓ | ✗(1) |
| think_off_kwargs | ✓ | ✗(2) | ✓ | ✓ | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ |
| think_on_kwargs | ✓ | ✗(2) | ✓ | ✓ | ✓ | ✓ | ✗(2) | ✓ | ✓ | ✓ | ✓ |
| think_effort_low | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ |
| think_effort_none | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ |
| think_kwarg_thinking_false | ✗(1) | ✗(2) | ✗(1) | ✗(1) | ✓ | ✗(1) | ✓ | ✓ | ✗(1) | ✗(1) | ✓ |
| system_prompt | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| multi_turn | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| temp0_repeat | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| top_p | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| length_truncation | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| stop_sequence | ✓ | ✗(2) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| json_object | ✓ | ✗(3) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| json_schema_strict | ✓ | ✗(5) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| stream_off | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| stream_think_on | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ |
| throughput_600 | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| context_24k | ✓ | ✗(1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| bad_response_format | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 | ✗400 |

## Tests A–E operations (households fixture, all repetitions)

| Config | n | ok | median latency s | max s | median in | median out | median reasoning | finish=length | median out tok/s |
|---|---|---|---|---|---|---|---|---|---|
| qwen27b | 9 | 9 | 41 | 113 | 1557 | 1478 | 0 | 0 | 32.4 |
| qwen27b-think | 5 | 5 | 340 | 559 | 1593 | 12000 | 11711 | 4 | 33 |
| glm47 | 5 | 5 | 50 | 172 | 1310 | 1335 | 0 | 0 | 25.1 |
| qwen-novelist | 5 | 5 | 67 | 130 | 1557 | 1105 | 0 | 0 | 21.6 |
| qwen-moxie | 5 | 5 | 67 | 95 | 1557 | 1263 | 0 | 0 | 22.9 |
| gemma-distill | 5 | 5 | 63 | 79 | 1569 | 1052 | 0 | 0 | 17.3 |
| gemma-it | 9 | 9 | 135 | 261 | 1569 | 1223 | 0 | 0 | 9.4 |
| qwen-flash | 5 | 5 | 60 | 124 | 1557 | 1569 | 0 | 0 | 41.3 |
| mimo-flash | 9 | 9 | 30 | 115 | 1547 | 1528 | 0 | 0 | 53.7 |
| gemma-writers | 1 | 1 | 71 | 71 | 2661 | 1097 | 0 | 0 | 15.9 |
| glm47-think | 9 | 8 | 126 | 498 | 1166.5 | 4041.5 | 2653 | 1 | 37.95 |
| deepseek-flash-think | 7 | 7 | 85 | 138 | 1057 | 3765 | 2502 | 0 | 49.7 |
| deepseek-flash | 9 | 9 | 55 | 127 | 1298 | 1271 | 0 | 0 | 28.8 |

## Test F operations (households-feel-poorer, 10 production stages)

| Config | n | ok | median latency s | max s | median in | median out | median reasoning | finish=length | median out tok/s |
|---|---|---|---|---|---|---|---|---|---|
| qwen27b | 10 | 10 | 47 | 72 | 10928 | 1424.5 | 0 | 0 | – |
| qwen-novelist | 10 | 10 | 51 | 81 | 10928 | 1205 | 0 | 0 | – |
| qwen-moxie | 10 | 10 | 49 | 80 | 10928 | 1322.5 | 0 | 0 | – |
| glm47 | 10 | 10 | 48 | 124 | 9854.5 | 958.5 | 0 | 0 | – |
| deepseek-flash | 10 | 10 | 34 | 99 | 9881.5 | 1370.5 | 0 | 0 | – |
| gemma-distill | 10 | 10 | 61 | 287 | 10962.5 | 744.5 | 0 | 1 | – |
| gemma-it | 10 | 10 | 81 | 144 | 10962.5 | 969.5 | 0 | 0 | – |
| qwen-flash | 10 | 10 | 69 | 191 | 10928 | 1582 | 0 | 1 | – |
| mimo-flash | 10 | 10 | 56 | 251 | 10752 | 1293 | 0 | 0 | – |
| gemma-writers | 10 | 10 | 71 | 183 | 10962.5 | 779.5 | 0 | 0 | – |

## Test A — deterministic answers

| Config | answers correct | out tokens | finish |
|---|---|---|---|
| qwen27b | 9/15 | 877 | stop |
| qwen27b-think | 0/3 | 12000 | length |
| glm47 | 9/15 | 712 | stop |
| qwen-novelist | 10/15 | 957 | stop |
| qwen-moxie | 9/15 | 877 | stop |
| gemma-distill | 10/15 | 773 | stop |
| gemma-it | 13/15 | 1223 | stop |
| qwen-flash | 15/15 | 2294 | stop |
| mimo-flash | 8/15 | 124 | stop |
| glm47-think | 15/15 | 5388 | stop |
| deepseek-flash-think | 15/15 | 6690 | stop |
| deepseek-flash | 15/15 | 1030 | stop |

## Test F — checks by stage (✓ all pass · ✗ ids that failed · →R after production repair round)

| Stage | qwen27b | qwen-novelist | qwen-moxie | glm47 | deepseek-flash | gemma-distill | gemma-it | qwen-flash | mimo-flash | gemma-writers |
|---|---|---|---|---|---|---|---|---|---|---|
| brief | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| plan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| select | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| synthesize | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ len,fence,json →R ✗ | ✓ | ✓ | ✓ | ✓ |
| story | ✗ bare | ✓ | ✗ bare | ✓ | ✓ | ✓ | ✗ bare | ✗ len,fence,json →R ✗ | ✓ | ✗ bare |
| macro_analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ bare | ✓ | ✓ |
| outlook | ✗ bare,no-tokens | ✗ bare,no-tokens | ✗ bare,no-tokens | ✗ bare,no-tokens | ✓ | ✗ no-tokens | ✓ | ✗ bare | ✓ | ✗ bare |
| review | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| repair | ✗ bare | ✗ bare | ✓ | ✗ bare | ✓ | ✓ | ✓ | ✓ | ✗ bare | ✓ |
| polish | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
