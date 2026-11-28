// Phase 3D.1a live probe (D-058): for each configured model, confirm the
// identifier is served, that the production thinking-off switch really
// disables reasoning (reasoning_tokens = 0 and, where the template changes,
// a lower prompt-token count than with no switch — the Phase 3D.1 method),
// and that a strict json_schema reply parses through the production client.
// Requests run strictly one at a time; refuses to start while a generation
// job is active (the Arli slot is shared, D-010).
//
//   node scripts/studio/model-probe.ts [--models A,B,C]
// Defaults to the resolved analytical, editorial and base models. Prints no secrets.
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readEnv } from '../lib/env-file.mjs';
import { arliLlm } from '../../lib/studio/llm.ts';
import { modelOverrides, resolveModels, thinkingOffParams } from '../../lib/studio/model-roles.ts';

const env = { ...(readEnv() as Record<string, string>), ...modelOverrides(process.env) } as Record<string, string>;
const args = process.argv.slice(2);
const mi = args.indexOf('--models');
const sel = resolveModels(env);
const models = mi >= 0 ? args[mi + 1].split(',') : [...new Set([sel.analytical, sel.editorial, sel.base])];

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { error: authErr } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
if (authErr) throw new Error(`editor sign-in failed: ${authErr.message}`);
const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
if (active?.length) throw new Error('a generation job is active; the Arli slot is shared — try later');

const PROMPT = 'A price index was 314.732 in Sep 2024, 324.245 in Sep 2025 and 336.298 in Sep 2026. Give the two 12-month inflation rates (1 decimal) and the change between them in percentage points. Be brief.';
async function raw(model: string, extra: Record<string, unknown>) {
  const t0 = Date.now();
  const res = await fetch(`${env.ARLI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ARLI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: PROMPT }], max_tokens: 1500, temperature: 0.2, ...extra }),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok) return { status: res.status, ms: Date.now() - t0, error: text.slice(0, 160) };
  const j = JSON.parse(text);
  const m = j.choices?.[0]?.message ?? {};
  return {
    status: res.status,
    ms: Date.now() - t0,
    servedModel: j.model,
    promptTokens: j.usage?.prompt_tokens,
    completionTokens: j.usage?.completion_tokens,
    reasoningTokens: j.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    reasoningChars: String(m.reasoning_content ?? m.reasoning ?? '').length,
    finish: j.choices?.[0]?.finish_reason,
    nonLatin: /[Ѐ-ӿ֐-ۿ぀-ヿ㐀-鿿가-힯]/.test(String(m.content ?? '')),
    templateTokens: /<\|[a-z_]+\|?>|<\/?think>/i.test(String(m.content ?? '')),
  };
}

const Answer = z.object({ rate2025: z.number(), rate2026: z.number(), changePp: z.number(), note: z.string().max(200) });
process.env.LLM_LOG = 'off';
const report: Record<string, unknown>[] = [];
for (const model of models) {
  const withDefault = await raw(model, {});
  const withSwitch = await raw(model, thinkingOffParams(model));
  let structured: Record<string, unknown>;
  try {
    const r = await arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model, timeoutMs: 300_000 }).complete({
      stage: 'probe',
      system: 'Answer in JSON only.',
      user: PROMPT,
      schema: Answer,
      maxTokens: 600,
      temperature: 0.2,
    });
    const correct = Math.abs(r.data.rate2025 - 3.0) < 0.051 && Math.abs(r.data.rate2026 - 3.7) < 0.051 && Math.abs(r.data.changePp - 0.7) < 0.051;
    structured = { ok: true, ms: r.ms, attempts: r.attempts, finish: r.finish, usage: r.usage, correct };
  } catch (e) {
    structured = { ok: false, error: (e as Error).message.slice(0, 200) };
  }
  const off = withSwitch as { reasoningTokens?: number; reasoningChars?: number; promptTokens?: number; status: number };
  const verdict = off.status === 200 && !off.reasoningTokens && !off.reasoningChars ? 'thinking off: verified' : 'thinking off: NOT verified';
  const row = { model, verdict, switch: thinkingOffParams(model), withDefault, withSwitch, structured };
  console.log(JSON.stringify(row));
  report.push(row);
}
await db.auth.signOut();
