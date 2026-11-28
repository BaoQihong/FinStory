// One-off diagnostic: which request parameter (if any) disables DeepSeek-V4.1-Flash
// reasoning on a task that needs some work? (Trivial prompts reason ~1 token
// regardless, so the qualification probe could not tell.)
//   node research/model-eval/diagnostics/deepseek-thinking.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arliEnv } from '../lib/env.ts';
import { chat } from '../lib/arli.ts';

const { baseUrl, apiKey } = arliEnv();
const M = 'DeepSeek-V4.1-Flash-1017';
const msg = [{ role: 'user' as const, content: 'A price index was 314.732 in Sep 2024, 324.245 in Sep 2025 and 336.298 in Sep 2026. Give the two 12-month inflation rates (1 decimal) and the change between them in percentage points. Be brief.' }];
const base = { max_tokens: 1500, temperature: 0.2 };
const variants: [string, Record<string, unknown>][] = [
  ['default', {}],
  ['enable_thinking_false', { chat_template_kwargs: { enable_thinking: false } }],
  ['thinking_false', { chat_template_kwargs: { thinking: false } }],
  ['both_false', { chat_template_kwargs: { enable_thinking: false, thinking: false } }],
  ['reasoning_effort_none', { reasoning_effort: 'none' }],
  ['thinking_disabled', { thinking: { type: 'disabled' } }],
];
const out: unknown[] = [];
for (const [id, p] of variants) {
  const r = await chat(baseUrl, apiKey, { model: M, messages: msg, params: { ...base, ...p }, stream: false, timeoutMs: 300000 });
  const row = { id, params: p, ok: r.ok, status: r.httpStatus, err: r.errorDetail?.slice(0, 160), latencyMs: r.latencyMs, finish: r.finishReason, usage: r.usage, reasoningChars: r.reasoning?.length ?? 0, content: r.content.slice(0, 160) };
  console.log(JSON.stringify(row));
  out.push(row);
  await new Promise((s) => setTimeout(s, 1000));
}
writeFileSync(join(import.meta.dirname, '..', 'results', 'diag-deepseek-thinking-2026-11-28.json'), JSON.stringify(out, null, 1));
