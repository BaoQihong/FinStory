// Minimal raw client for Arli AI's OpenAI-compatible chat-completions API.
// Research use only: deliberately NOT a provider abstraction. It sends the body
// it is given (plus model/messages), records exactly what came back, and
// normalises only what the evaluation needs. It never changes the model.
import { sanitize } from './env.ts';

export type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export type CallSpec = {
  model: string;
  messages: Message[];
  /** Everything else sent in the body: max_tokens, temperature, top_p, stop, response_format, chat_template_kwargs, … */
  params: Record<string, unknown>;
  stream: boolean;
  timeoutMs: number;
};

export type Usage = { input: number | null; output: number | null; reasoning: number | null; total: number | null };

export type CallResult = {
  ok: boolean;
  httpStatus: number | null;
  errorKind: null | 'timeout' | 'network' | 'http' | 'parse' | 'empty' | 'stream';
  errorDetail: string | null;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  /** Streaming only: ms from request start to the first content or reasoning delta. */
  ttftMs: number | null;
  /** Streaming only: ms to the first delta of final-answer content (after any reasoning). */
  firstContentMs: number | null;
  content: string;
  reasoning: string | null;
  /** Where reasoning came from: message.reasoning_content, message.reasoning, inline <think> tags, or none. */
  reasoningField: null | 'reasoning_content' | 'reasoning' | 'inline_think';
  finishReason: string | null;
  usage: Usage;
  /** `model` echoed by the API (to detect substitution). */
  echoedModel: string | null;
  headers: Record<string, string>;
  /** Sanitised raw body (non-stream) or a digest of the SSE stream. */
  raw: unknown;
  streamChunks: number | null;
};

const KEEP_HEADERS = /^(x-ratelimit|ratelimit|retry-after|x-request-id|x-arli|content-type|server|x-queue|x-model|cf-ray)/i;

function pickHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (KEEP_HEADERS.test(k)) out[k] = v;
  });
  return out;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function usageOf(u: Record<string, unknown> | undefined | null): Usage {
  if (!u) return { input: null, output: null, reasoning: null, total: null };
  const d = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  return { input: num(u.prompt_tokens), output: num(u.completion_tokens), reasoning: num(d.reasoning_tokens), total: num(u.total_tokens) };
}

function splitThink(content: string): { content: string; reasoning: string | null } {
  const m = content.match(/^\s*<think>([\s\S]*?)<\/think>\s*/);
  if (m) return { content: content.slice(m[0].length), reasoning: m[1].trim() };
  // An unterminated <think> (truncated reasoning) leaves no final answer.
  const open = content.match(/^\s*<think>([\s\S]*)$/);
  if (open) return { content: '', reasoning: open[1].trim() };
  return { content, reasoning: null };
}

export async function chat(baseUrl: string, apiKey: string, spec: CallSpec): Promise<CallResult> {
  const secrets = [apiKey];
  const body = { ...spec.params, model: spec.model, messages: spec.messages, ...(spec.stream ? { stream: true, stream_options: { include_usage: true } } : {}) };
  const t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), spec.timeoutMs);
  const base: CallResult = {
    ok: false,
    httpStatus: null,
    errorKind: null,
    errorDetail: null,
    startedAt,
    completedAt: startedAt,
    latencyMs: 0,
    ttftMs: null,
    firstContentMs: null,
    content: '',
    reasoning: null,
    reasoningField: null,
    finishReason: null,
    usage: { input: null, output: null, reasoning: null, total: null },
    echoedModel: null,
    headers: {},
    raw: null,
    streamChunks: null,
  };
  const done = (r: Partial<CallResult>): CallResult => {
    const t1 = Date.now();
    return { ...base, ...r, completedAt: new Date(t1).toISOString(), latencyMs: t1 - t0 };
  };
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    base.httpStatus = res.status;
    base.headers = pickHeaders(res.headers);
    if (!res.ok) {
      const text = sanitize(await res.text(), secrets);
      return done({ errorKind: 'http', errorDetail: text.slice(0, 2000), raw: text.slice(0, 4000) });
    }
    if (!spec.stream) {
      const text = sanitize(await res.text(), secrets);
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(text);
      } catch {
        return done({ errorKind: 'parse', errorDetail: text.slice(0, 500), raw: text.slice(0, 4000) });
      }
      const choice = ((j.choices as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
      if (j.error || !choice) return done({ errorKind: j.error ? 'stream' : 'empty', errorDetail: JSON.stringify(j.error ?? 'no choices').slice(0, 500), raw: j });
      const msg = (choice?.message ?? {}) as Record<string, unknown>;
      let content = typeof msg.content === 'string' ? msg.content : '';
      let reasoning: string | null = null;
      let reasoningField: CallResult['reasoningField'] = null;
      if (typeof msg.reasoning_content === 'string' && msg.reasoning_content) {
        reasoning = msg.reasoning_content;
        reasoningField = 'reasoning_content';
      } else if (typeof msg.reasoning === 'string' && msg.reasoning) {
        reasoning = msg.reasoning;
        reasoningField = 'reasoning';
      } else {
        const s = splitThink(content);
        if (s.reasoning !== null) {
          content = s.content;
          reasoning = s.reasoning;
          reasoningField = 'inline_think';
        }
      }
      return done({
        ok: true,
        content,
        reasoning,
        reasoningField,
        finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
        usage: usageOf(j.usage as Record<string, unknown>),
        echoedModel: typeof j.model === 'string' ? j.model : null,
        raw: { ...j, choices: (j.choices as unknown[])?.map((c) => c) },
      });
    }
    // ── Streaming (SSE) ──
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let content = '';
    let reasoning = '';
    let reasoningField: CallResult['reasoningField'] = null;
    let finish: string | null = null;
    let usage: Usage = { input: null, output: null, reasoning: null, total: null };
    let echoed: string | null = null;
    let ttft: number | null = null;
    let firstContent: number | null = null;
    let chunks = 0;
    const sample: unknown[] = [];
    let last: unknown = null;
    // Arli can answer HTTP 200 and then send an SSE `error` event (seen: DeepSeek
    // "tensor-parallel graph completion deadline expired"). That is a failure.
    let streamError: string | null = null;
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j: Record<string, unknown>;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        chunks++;
        if (sample.length < 3) sample.push(j);
        last = j;
        if (j.error) streamError = JSON.stringify(j.error).slice(0, 500);
        if (typeof j.model === 'string') echoed = j.model;
        if (j.usage) usage = usageOf(j.usage as Record<string, unknown>);
        const ch = ((j.choices as unknown[]) ?? [])[0] as Record<string, unknown> | undefined;
        if (!ch) continue;
        if (typeof ch.finish_reason === 'string') finish = ch.finish_reason;
        const d = (ch.delta ?? {}) as Record<string, unknown>;
        const rc = typeof d.reasoning_content === 'string' ? d.reasoning_content : typeof d.reasoning === 'string' ? d.reasoning : '';
        if (rc) {
          reasoningField ??= typeof d.reasoning_content === 'string' ? 'reasoning_content' : 'reasoning';
          reasoning += rc;
          ttft ??= Date.now() - t0;
        }
        if (typeof d.content === 'string' && d.content) {
          content += d.content;
          ttft ??= Date.now() - t0;
          firstContent ??= Date.now() - t0;
        }
      }
    }
    if (streamError) return done({ errorKind: 'stream', errorDetail: sanitize(streamError, secrets), raw: JSON.parse(sanitize(JSON.stringify({ firstChunks: sample, lastChunk: last, chunkCount: chunks }), secrets)), streamChunks: chunks, ttftMs: ttft });
    if (!content && !reasoning && finish === null) return done({ errorKind: 'empty', errorDetail: 'stream ended with no content, no reasoning and no finish_reason', streamChunks: chunks, raw: JSON.parse(sanitize(JSON.stringify({ firstChunks: sample, lastChunk: last, chunkCount: chunks }), secrets)) });
    if (!reasoning) {
      const s = splitThink(content);
      if (s.reasoning !== null) {
        content = s.content;
        reasoning = s.reasoning;
        reasoningField = 'inline_think';
      }
    }
    return done({
      ok: true,
      content,
      reasoning: reasoning || null,
      reasoningField,
      finishReason: finish,
      usage,
      echoedModel: echoed,
      ttftMs: ttft,
      firstContentMs: firstContent,
      streamChunks: chunks,
      raw: JSON.parse(sanitize(JSON.stringify({ firstChunks: sample, lastChunk: last, chunkCount: chunks }), secrets)),
    });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    return done({ errorKind: aborted ? 'timeout' : 'network', errorDetail: sanitize(aborted ? `timed out after ${spec.timeoutMs} ms` : String((e as Error).message), secrets) });
  } finally {
    clearTimeout(timer);
  }
}

export async function listModels(baseUrl: string, apiKey: string): Promise<{ status: number; models: Record<string, unknown>[] }> {
  const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const j = (await res.json()) as { data?: Record<string, unknown>[] };
  return { status: res.status, models: j.data ?? [] };
}
