// One-off diagnostic: is Qwen3.8-27B-antislop's degenerate output a sampling
// issue (fixable by parameters) or a serving/weights issue? Sequential, tiny.
//   node research/model-eval/diagnostics/antislop.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arliEnv } from '../lib/env.ts';
import { chat } from '../lib/arli.ts';

const { baseUrl, apiKey } = arliEnv();
const M = 'Qwen3.8-27B-antislop';
const msg = [{ role: 'user' as const, content: 'What is 17 times 23? Reply with the number only.' }];
const variants: [string, Record<string, unknown>][] = [
  ['t0.7_off', { max_tokens: 200, temperature: 0.7, top_p: 0.8, chat_template_kwargs: { enable_thinking: false } }],
  ['t1.0_off', { max_tokens: 200, temperature: 1.0, chat_template_kwargs: { enable_thinking: false } }],
  ['t0.7_rep1.1_off', { max_tokens: 200, temperature: 0.7, repetition_penalty: 1.1, chat_template_kwargs: { enable_thinking: false } }],
  ['t0_off', { max_tokens: 200, temperature: 0, chat_template_kwargs: { enable_thinking: false } }],
  ['minp_off', { max_tokens: 200, temperature: 0.6, min_p: 0.05, top_k: 20, chat_template_kwargs: { enable_thinking: false } }],
];
const out: unknown[] = [];
for (const [id, params] of variants) {
  const r = await chat(baseUrl, apiKey, { model: M, messages: msg, params, stream: false, timeoutMs: 180000 });
  const row = { id, params, ok: r.ok, status: r.httpStatus, latencyMs: r.latencyMs, finish: r.finishReason, usage: r.usage, content: r.content.slice(0, 200), reasoning: (r.reasoning ?? '').slice(0, 120) };
  console.log(JSON.stringify(row));
  out.push(row);
  await new Promise((s) => setTimeout(s, 1000));
}
writeFileSync(join(import.meta.dirname, '..', 'results', 'diag-antislop-2026-11-28.json'), JSON.stringify(out, null, 1));
