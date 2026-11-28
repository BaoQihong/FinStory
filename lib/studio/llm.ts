// Arli AI (OpenAI-compatible) client for structured generation.
//
// - Thinking disabled (D-009): reasoning tokens otherwise consume max_tokens.
//   The switch is per model family (model-roles.ts, D-058); reasoning reported
//   despite the switch is logged as a warning, never silently accepted.
// - Interim model roles (D-058): roleLlm() routes each stage to the analytical
//   or editorial model; with no role variables it is ARLI_MODEL only.
// - response_format json_schema (verified accepted by Arli for Qwen3.8-27B);
//   falls back to json_object if a schema is rejected with HTTP 400.
// - Every reply is validated with zod; one repair round feeds the validation
//   errors back. Invalid output is never passed on.
// - Calls are serialised in-process; cross-request single concurrency is
//   enforced by the one-active-job index + job lease (D-010, D-026).
import { z } from 'zod';
import { modelForStage, resolveModels, selectionLabel, thinkingOffParams, type ModelEnv } from './model-roles.ts';

export type LlmUsage = { promptTokens: number; completionTokens: number; reasoningTokens?: number };
export type LlmResult<T> = { data: T; usage: LlmUsage; ms: number; attempts: number; model: string; finish?: string };
export type LlmRequest<T> = {
  stage: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  temperature?: number;
};

export interface Llm {
  readonly model: string;
  complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}

export class LlmError extends Error {
  readonly retryable: boolean;
  readonly usage: LlmUsage;
  /** The model the failing request was sent to (set by arliLlm). */
  model?: string;
  constructor(message: string, retryable: boolean, usage: LlmUsage = { promptTokens: 0, completionTokens: 0 }) {
    super(message);
    this.retryable = retryable;
    this.usage = usage;
  }
}

/** Stage metrics for one completed call: usage, repair rounds, the model actually used, finish reason. */
export const llmMetric = (r: LlmResult<unknown>) => ({ ...r.usage, attempts: r.attempts, model: r.model, ...(r.finish ? { finish: r.finish } : {}) });

/** One structured log line per HTTP call. Never prompts, output, reasoning text or credentials. */
function logCall(entry: Record<string, unknown>) {
  if (process.env.LLM_LOG === 'off') return;
  const line = `[llm] ${JSON.stringify(entry)}`;
  if (entry.warning || entry.error) console.warn(line);
  else console.info(line);
}

let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Extract the first JSON object from a reply (tolerates ```json fences or stray prose). */
export function parseJsonObject(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
    throw new Error('reply contained no JSON object');
  }
}

const issuesText = (err: z.ZodError) =>
  err.issues
    .slice(0, 15)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');

export function arliLlm(cfg: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }): Llm {
  const timeoutMs = cfg.timeoutMs ?? 200_000;
  const thinkingOff = thinkingOffParams(cfg.model);
  async function call(body: Record<string, unknown>) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, ...thinkingOff, ...body }),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) return { ok: false as const, status: res.status, text: text.slice(0, 300) };
      const j = JSON.parse(text);
      const msg = j.choices?.[0]?.message ?? {};
      return {
        ok: true as const,
        content: String(msg.content ?? ''),
        finish: String(j.choices?.[0]?.finish_reason ?? ''),
        servedModel: typeof j.model === 'string' ? j.model : cfg.model,
        usage: { promptTokens: j.usage?.prompt_tokens ?? 0, completionTokens: j.usage?.completion_tokens ?? 0 },
        reasoningTokens: Number(j.usage?.completion_tokens_details?.reasoning_tokens ?? 0) || 0,
        // Length only: reasoning text is never logged or stored.
        reasoningChars: String(msg.reasoning_content ?? msg.reasoning ?? '').length,
      };
    } catch (e) {
      const aborted = (e as Error).name === 'AbortError';
      throw new LlmError(aborted ? `Arli request timed out after ${timeoutMs / 1000}s` : `Arli request failed: ${(e as Error).message}`, true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    model: cfg.model,
    complete<T>(req: LlmRequest<T>) {
      return serialised(async () => {
        const t0 = Date.now();
        const usage: LlmUsage = { promptTokens: 0, completionTokens: 0 };
        const jsonSchema = z.toJSONSchema(req.schema, { target: 'draft-7', unrepresentable: 'any' });
        let format: Record<string, unknown> = { type: 'json_schema', json_schema: { name: req.stage, schema: jsonSchema, strict: true } };
        const messages: { role: string; content: string }[] = [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ];
        const fail = (e: LlmError) => {
          e.model = cfg.model;
          return e;
        };
        let lastProblem = '';
        let finish = '';
        for (let attempt = 1; attempt <= 2; attempt++) {
          const send = async () => {
            const c0 = Date.now();
            const base = { stage: req.stage, model: cfg.model, attempt, format: (format as { type: string }).type };
            try {
              const res = await call({ messages, max_tokens: req.maxTokens, temperature: req.temperature ?? 0.4, response_format: format });
              if (!res.ok) logCall({ ...base, ms: Date.now() - c0, status: res.status, error: `HTTP ${res.status}` });
              else
                logCall({
                  ...base,
                  ms: Date.now() - c0,
                  ...(res.servedModel !== cfg.model ? { servedModel: res.servedModel } : {}),
                  promptTokens: res.usage.promptTokens,
                  completionTokens: res.usage.completionTokens,
                  reasoningTokens: res.reasoningTokens,
                  finish: res.finish,
                  ...(res.reasoningTokens > 0 || res.reasoningChars > 0 ? { warning: 'reasoning output despite thinking disabled', reasoningChars: res.reasoningChars } : {}),
                });
              return res;
            } catch (e) {
              logCall({ ...base, ms: Date.now() - c0, error: (e as Error).message.slice(0, 200) });
              throw e instanceof LlmError ? fail(e) : e;
            }
          };
          let r = await send();
          if (!r.ok && r.status === 400 && (format as { type: string }).type === 'json_schema') {
            format = { type: 'json_object' };
            r = await send();
          }
          if (!r.ok) {
            const retryable = r.status === 429 || r.status >= 500;
            throw fail(new LlmError(`Arli HTTP ${r.status}: ${r.text}`, retryable, usage));
          }
          usage.promptTokens += r.usage.promptTokens;
          usage.completionTokens += r.usage.completionTokens;
          if (r.reasoningTokens) usage.reasoningTokens = (usage.reasoningTokens ?? 0) + r.reasoningTokens;
          finish = r.finish;
          let parsed: unknown;
          try {
            parsed = parseJsonObject(r.content);
          } catch (e) {
            lastProblem = r.finish === 'length' ? `output was cut off at max_tokens (${req.maxTokens})` : (e as Error).message;
            messages.push({ role: 'assistant', content: r.content.slice(0, 4000) }, {
              role: 'user',
              content: `Your reply was not valid JSON (${lastProblem}). Reply again with ONE complete JSON object that follows the schema. Be more concise if needed.`,
            });
            continue;
          }
          const v = req.schema.safeParse(parsed);
          if (v.success) return { data: v.data, usage, ms: Date.now() - t0, attempts: attempt, model: cfg.model, finish };
          lastProblem = issuesText(v.error);
          messages.push({ role: 'assistant', content: r.content.slice(0, 12000) }, {
            role: 'user',
            content: `Your JSON did not validate:\n${lastProblem}\nReturn the corrected, complete JSON object only.`,
          });
        }
        throw fail(new LlmError(`${req.stage}: model output failed validation after 2 attempts — ${lastProblem.slice(0, 500)}`, true, usage));
      });
    },
  };
}

/**
 * Interim role routing (D-058): one Arli client per distinct model, chosen by
 * the request's stage (model-roles.ts). All clients share this module's
 * serialisation queue, so concurrency is unchanged. `model` is the selection
 * label: the single id when every role resolves to the same model.
 */
export function roleLlm(cfg: { baseUrl: string; apiKey: string; env: ModelEnv; timeoutMs?: number }): Llm {
  const sel = resolveModels(cfg.env);
  const clients = new Map<string, Llm>();
  const client = (model: string) => {
    let c = clients.get(model);
    if (!c) clients.set(model, (c = arliLlm({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model, timeoutMs: cfg.timeoutMs })));
    return c;
  };
  return {
    model: selectionLabel(sel),
    complete: (req) => client(modelForStage(sel, req.stage)).complete(req),
  };
}
