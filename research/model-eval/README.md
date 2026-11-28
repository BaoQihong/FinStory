# Seshat model evaluation harness (Phase 3D.1)

A standalone research utility for qualifying and benchmarking LLMs on Arli AI.
It is **not** part of the application and **not** the future Model Gateway:
nothing in `app/`, `lib/` or the production pipeline imports it, and it
changes no production setting. It reads production prompt builders, schemas
and validators (read-only) so Test F measures real compatibility.

Report: [`docs/research/phase-3d1-model-evaluation.md`](../../docs/research/phase-3d1-model-evaluation.md) ·
Rubric: [`RUBRIC.md`](RUBRIC.md)

## Layout

```text
research/model-eval/
  run.ts               CLI: catalog | qual | concurrency | bench
  aggregate.ts         records → summary.json + requests.csv (per config / suite / case, with n)
  anonymize.ts         blind samples (final answers only) + separate key file (--rep N for one repetition)
  report-tables.ts     Markdown tables for the report → results/report-tables.md
  diagnostics/         one-off probes behind exclusions (antislop.ts, deepseek-thinking.ts)
  models.ts            shortlist and benchmark configurations (model × thinking mode)
  RUBRIC.md            qualitative scoring rubric (written before scoring)
  lib/                 arli.ts (raw HTTP + SSE client), runner.ts (sequential, resumable),
                       env.ts (credentials, sanitising), json.ts, types.ts
  suites/              qual.ts (technical probes), analysis.ts (tests A–D),
                       writing.ts (test E), seshat.ts (test F), index.ts
  fixtures/
    build-macro.ts     freezes FRED data once → v1/macro-us.json
    capture-seshat.ts  freezes the exact production stage requests → v1/seshat/<subject>/
    stats.ts           deterministic helpers; every answer key is computed, not typed
    v1/                frozen, versioned fixtures (committed)
  results/<runId>/     records.jsonl (one line per request), outputs/ (normalised text),
                       raw/ (sanitised raw API bodies / SSE digests), meta-*.json
  results/summary-*/   aggregated statistics
  samples/             anonymised samples + SCORES.md per round; raw-sample/ = a few sanitised
                       raw bodies (raw/ itself is git-ignored)
```

## Rerunning

All commands run from the repository root. Credentials come from `.env.local`
(`ARLI_BASE_URL`, `ARLI_API_KEY`, `ARLI_MODEL`; `FRED_API_KEY` for fixture
building; the editor login for the preflight and capture). Nothing secret is
printed or written: results carry a key fingerprint only, and every raw body is
passed through a redactor.

```bash
node research/model-eval/run.ts catalog                       # live model list → results/catalog-*.json
node research/model-eval/run.ts qual                          # technical qualification, all shortlisted models
node research/model-eval/run.ts qual --models GLM-4.7 --cases json_schema_strict
node research/model-eval/run.ts concurrency                   # 3 tiny parallel requests, once (run only when production is idle)
node research/model-eval/run.ts bench --suites A,B,C,D,E --configs qwen27b,glm47-think
node research/model-eval/run.ts bench --suites F --configs qwen27b --subject households-feel-poorer
node research/model-eval/aggregate.ts <runId> [<runId> …]
node research/model-eval/anonymize.ts <runId> --suites B,C,E --out samples/run1
node research/model-eval/anonymize.ts pilot-households bench-households --suites B,C,D,E --rep 2 --out samples/households-v1-rep2
node research/model-eval/report-tables.ts > research/model-eval/results/report-tables.md
```

Options: `--run <id>` resumes into an existing run directory (completed
requests are skipped; `--retry-errors` re-attempts failed ones — a request
recorded as ok is never re-run, so use a new run id to repeat it), `--timeout
<ms>` (lengthens, never shortens, a case's own timeout; thinking runs used
`--timeout 900000 --retries 0`), `--retries <n>` (transport/429/5xx only; never another model),
`--gap <ms>`, `--token-scale <x>` (multiplies every `max_tokens`), `--reps <n>`,
`--cases <prefix,…>`, `--dry-run`, `--skip-preflight`.

**Failures recorded:** HTTP errors, timeouts, network errors, an HTTP 200
stream that carries an SSE `error` event, and empty responses; the last two
are retryable like 5xx/429.

**Concurrency:** requests run strictly one at a time (D-010). The preflight
refuses to start while a production generation job or a Polish/Fix/Brief
reservation is in flight, because production shares the same Arli slot. Avoid
running benchmarks while an editor is using the studio.

## Rebuilding fixtures

```bash
node research/model-eval/fixtures/build-macro.ts              # re-freezes FRED data (bump the fixture version!)
node research/model-eval/fixtures/capture-seshat.ts --article <uuid> --subject <slug>
```

Changing a fixture changes what models are compared on: bump the version
string in the suite (`ANALYSIS_VERSION`, `WRITING_VERSION`, `SESHAT_VERSION`)
so old and new results are never mixed. Prompt hashes for Test F are stored in
`fixtures/v1/seshat/<subject>/context.json`.

## Reuse in Phase 3D.2

`lib/types.ts` (`Case`, `Check`, `RecordRow`), the fixtures and the
evaluators in `suites/` have no dependency on the HTTP client. A future
gateway can replay the same `Case` objects through its own client and compare
records against these baselines.
