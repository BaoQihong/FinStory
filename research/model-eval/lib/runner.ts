// Sequential, resumable runner. One request in flight at a time (D-010).
// Every attempt is recorded; nothing is retried with a different model.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chat, type CallResult, type Message } from './arli.ts';
import type { Case, Check, ModelConfig, RecordRow } from './types.ts';

export const HARNESS_VERSION = 'model-eval/1.0';
export const THINKING_BUDGET_MULTIPLIER = 3;

export type RunOptions = {
  runDir: string;
  runId: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retries: number;
  gapMs: number;
  /** Multiplies every case's max_tokens (token budget control); 1 = as defined. */
  tokenScale: number;
  retryErrors: boolean;
  dryRun: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (r: CallResult) => r.errorKind === 'timeout' || r.errorKind === 'network' || r.errorKind === 'stream' || r.errorKind === 'empty' || (r.errorKind === 'http' && (r.httpStatus === 429 || (r.httpStatus ?? 0) >= 500));

export function loadDone(runDir: string): Map<string, RecordRow> {
  const f = join(runDir, 'records.jsonl');
  const m = new Map<string, RecordRow>();
  if (!existsSync(f)) return m;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as RecordRow;
    m.set(r.key, r); // last write wins
  }
  return m;
}

const strip = (r: CallResult): Omit<CallResult, 'raw'> => {
  const rest: Partial<CallResult> = { ...r };
  delete rest.raw;
  return rest as Omit<CallResult, 'raw'>;
};

function sameModel(requested: string, echoed: string | null): boolean | null {
  if (!echoed) return null;
  const norm = (s: string) => s.toLowerCase().replace(/^.*\//, '');
  return norm(requested) !== norm(echoed);
}

export async function runCases(configs: ModelConfig[], cases: Case[], o: RunOptions, log = console.log) {
  mkdirSync(join(o.runDir, 'raw'), { recursive: true });
  mkdirSync(join(o.runDir, 'outputs'), { recursive: true });
  const done = loadDone(o.runDir);
  const plan: { c: ModelConfig; k: Case; rep: number; key: string }[] = [];
  for (const k of cases)
    for (const c of configs) {
      if (!c.suites.includes(k.suite)) continue;
      if (k.appliesTo && !k.appliesTo(c)) continue;
      for (let rep = 1; rep <= (k.reps ?? 1); rep++) {
        const key = `${c.id}|${k.suite}|${k.id}|${rep}`;
        const prev = done.get(key);
        if (prev && (prev.result.ok || !o.retryErrors)) continue;
        plan.push({ c, k, rep, key });
      }
    }
  log(`${plan.length} request(s) to run (${done.size} already recorded in ${o.runDir})`);
  if (o.dryRun) {
    for (const p of plan) log(`  would run ${p.key}`);
    return;
  }
  let n = 0;
  for (const p of plan) {
    n++;
    const params: Record<string, unknown> = { ...p.k.params, ...(p.k.ownThinking ? {} : p.c.thinkingParams) };
    // Thinking configs get 3× the budget (reasoning tokens share max_tokens, D-009); documented exception.
    const scale = o.tokenScale * (p.c.mode === 'on' && !p.k.ownThinking ? THINKING_BUDGET_MULTIPLIER : 1);
    if (typeof params.max_tokens === 'number' && scale !== 1) params.max_tokens = Math.round((params.max_tokens as number) * scale);
    // --timeout can lengthen (never shorten) a case-specific timeout.
    const timeoutMs = Math.max(p.k.timeoutMs ?? 0, o.timeoutMs);
    let r: CallResult | null = null;
    let attempt = 0;
    for (; attempt <= o.retries; attempt++) {
      if (attempt) await sleep(attempt === 1 ? 5000 : 20000);
      r = await chat(o.baseUrl, o.apiKey, { model: p.c.model, messages: p.k.messages, params, stream: p.k.stream, timeoutMs });
      if (r.ok || !retryable(r)) break;
      log(`    retryable failure (${r.errorKind} ${r.httpStatus ?? ''}); attempt ${attempt + 1}`);
    }
    attempt = Math.min(attempt, o.retries);
    let fallbackUsed: string | null = null;
    if (r && !r.ok && r.httpStatus === 400 && p.k.onHttp400Params) {
      log(`    HTTP 400 — production fallback ${JSON.stringify(p.k.onHttp400Params).slice(0, 80)}`);
      fallbackUsed = (r.errorDetail ?? '').slice(0, 300);
      Object.assign(params, p.k.onHttp400Params);
      r = await chat(o.baseUrl, o.apiKey, { model: p.c.model, messages: p.k.messages, params, stream: p.k.stream, timeoutMs });
    }
    const res = r!;
    let checks: Check[] = [];
    if (res.ok && p.k.evaluate) {
      try {
        checks = await p.k.evaluate(res, p.c);
      } catch (e) {
        checks = [{ id: 'evaluator_error', pass: null, detail: String((e as Error).message).slice(0, 300) }];
      }
    }
    // Production-style repair round (Test F): same conversation + feedback, once.
    let repairRound: RecordRow['repairRound'] = null;
    if (res.ok && p.k.repair) {
      const follow = p.k.repair(res);
      if (follow) {
        const msgs: Message[] = [...p.k.messages, ...follow];
        const r2 = await chat(o.baseUrl, o.apiKey, { model: p.c.model, messages: msgs, params, stream: p.k.stream, timeoutMs });
        const c2 = r2.ok && p.k.evaluate ? await p.k.evaluate(r2, p.c) : [];
        repairRound = { result: strip(r2), checks: c2 };
        writeFileSync(join(o.runDir, 'raw', `${safe(p.key)}.repair.json`), JSON.stringify(r2.raw, null, 1));
        writeFileSync(join(o.runDir, 'outputs', `${safe(p.key)}.repair.txt`), outputText(r2));
      }
    }
    const genMs = res.firstContentMs !== null || res.ttftMs !== null ? res.latencyMs - (res.ttftMs ?? 0) : null;
    const tps = res.ok && res.usage.output && genMs && genMs > 0 && p.k.stream ? Math.round((res.usage.output / (genMs / 1000)) * 10) / 10 : null;
    const row: RecordRow = {
      harness: HARNESS_VERSION,
      runId: o.runId,
      key: p.key,
      provider: 'arliai',
      config: p.c.id,
      model: p.c.model,
      mode: p.c.mode,
      suite: p.k.suite,
      case: p.k.id,
      category: p.k.category,
      subject: p.k.subject ?? null,
      fixtureVersion: p.k.fixtureVersion,
      rep: p.rep,
      params,
      stream: p.k.stream,
      promptChars: p.k.messages.reduce((a, m) => a + m.content.length, 0),
      attempt: attempt + 1,
      retries: attempt,
      result: strip(res),
      outputTokensPerSec: tps,
      checks,
      repairRound,
      fallbackUsed,
      substitution: sameModel(p.c.model, res.echoedModel),
    };
    appendFileSync(join(o.runDir, 'records.jsonl'), JSON.stringify(row) + '\n');
    writeFileSync(join(o.runDir, 'raw', `${safe(p.key)}.json`), JSON.stringify(res.raw, null, 1));
    writeFileSync(join(o.runDir, 'outputs', `${safe(p.key)}.txt`), outputText(res));
    const passed = checks.filter((x) => x.pass === true).length;
    log(
      `[${n}/${plan.length}] ${p.key} → ${res.ok ? 'ok' : `ERR ${res.errorKind} ${res.httpStatus ?? ''}`} ${res.latencyMs} ms, in/out/reason ${res.usage.input}/${res.usage.output}/${res.usage.reasoning}, finish=${res.finishReason}${checks.length ? `, checks ${passed}/${checks.length}` : ''}${repairRound ? `, repair→${repairRound.checks.filter((x) => x.pass).length}/${repairRound.checks.length}` : ''}`,
    );
    if (o.gapMs) await sleep(o.gapMs);
  }
}

export const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]+/g, '_');

function outputText(r: CallResult): string {
  return `${r.reasoning ? `<<<REASONING (${r.reasoningField})>>>\n${r.reasoning}\n<<<END REASONING>>>\n\n` : ''}${r.content}${r.ok ? '' : `\n[error ${r.errorKind} ${r.httpStatus ?? ''}: ${r.errorDetail ?? ''}]`}`;
}
