// Arli AI (OpenAI-compatible) client for structured generation.
//
// - Qwen thinking disabled (D-009): reasoning tokens otherwise consume max_tokens.
// - response_format json_schema (verified accepted by Arli for Qwen3.8-27B);
//   falls back to json_object if a schema is rejected with HTTP 400.
// - Every reply is validated with zod; one repair round feeds the validation
//   errors back. Invalid output is never passed on.
// - Calls are serialised in-process; cross-request single concurrency is
//   enforced by the one-active-job index + job lease (D-010, D-026).
import { z } from 'zod';

export type LlmUsage = { promptTokens: number; completionTokens: number };
export type LlmResult<T> = { data: T; usage: LlmUsage; ms: number; attempts: number; model: string };
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
  constructor(message: string, retryable: boolean, usage: LlmUsage = { promptTokens: 0, completionTokens: 0 }) {
    super(message);
    this.retryable = retryable;
    this.usage = usage;
  }
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
  async function call(body: Record<string, unknown>) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, chat_template_kwargs: { enable_thinking: false }, ...body }),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) return { ok: false as const, status: res.status, text: text.slice(0, 300) };
      const j = JSON.parse(text);
      return {
        ok: true as const,
        content: String(j.choices?.[0]?.message?.content ?? ''),
        finish: String(j.choices?.[0]?.finish_reason ?? ''),
        usage: { promptTokens: j.usage?.prompt_tokens ?? 0, completionTokens: j.usage?.completion_tokens ?? 0 },
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
        let lastProblem = '';
        for (let attempt = 1; attempt <= 2; attempt++) {
          let r = await call({ messages, max_tokens: req.maxTokens, temperature: req.temperature ?? 0.4, response_format: format });
          if (!r.ok && r.status === 400 && (format as { type: string }).type === 'json_schema') {
            format = { type: 'json_object' };
            r = await call({ messages, max_tokens: req.maxTokens, temperature: req.temperature ?? 0.4, response_format: format });
          }
          if (!r.ok) {
            const retryable = r.status === 429 || r.status >= 500;
            throw new LlmError(`Arli HTTP ${r.status}: ${r.text}`, retryable, usage);
          }
          usage.promptTokens += r.usage.promptTokens;
          usage.completionTokens += r.usage.completionTokens;
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
          if (v.success) return { data: v.data, usage, ms: Date.now() - t0, attempts: attempt, model: cfg.model };
          lastProblem = issuesText(v.error);
          messages.push({ role: 'assistant', content: r.content.slice(0, 12000) }, {
            role: 'user',
            content: `Your JSON did not validate:\n${lastProblem}\nReturn the corrected, complete JSON object only.`,
          });
        }
        throw new LlmError(`${req.stage}: model output failed validation after 2 attempts — ${lastProblem.slice(0, 500)}`, true, usage);
      });
    },
  };
}
