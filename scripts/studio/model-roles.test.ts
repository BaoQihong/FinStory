// Phase 3D.1a (D-058): interim model roles, per-family thinking switches and
// the Arli client's request body, routing, logging and repair behaviour —
// all against a stubbed fetch (no network).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { arliLlm, LlmError, llmMetric, roleLlm } from '../../lib/studio/llm.ts';
import { modelForStage, resolveModels, selectionLabel, STAGE_ROLES, thinkingOffParams } from '../../lib/studio/model-roles.ts';
import { usageRows } from '../../lib/studio/pipeline/runner.ts';
import { LLM_STAGES, type Deps, type Job } from '../../lib/studio/pipeline/types.ts';

const QWEN = 'Qwen3.8-27B';
const DEEPSEEK = 'DeepSeek-V4.1-Flash-1017';
const MIMO = 'MiMo-V2.6-Flash-MOPD';
const ANALYTICAL = ['plan', 'select', 'synthesize', 'macro_analytics', 'outlook', 'review', 'repair', 'brief', 'fix'];
const EDITORIAL = ['story', 'polish'];

// ── Configuration ────────────────────────────────────────────────────────
test('no role variables: every stage uses ARLI_MODEL (existing behaviour)', () => {
  const sel = resolveModels({ ARLI_MODEL: QWEN });
  assert.deepEqual(sel, { base: QWEN, analytical: QWEN, editorial: QWEN });
  for (const s of [...ANALYTICAL, ...EDITORIAL, 'evaluation', 'anything']) assert.equal(modelForStage(sel, s), QWEN);
  assert.equal(selectionLabel(sel), QWEN);
});

test('empty or whitespace role variables count as absent', () => {
  assert.deepEqual(resolveModels({ ARLI_MODEL: QWEN, ARLI_ANALYTICAL_MODEL: '', ARLI_EDITORIAL_MODEL: '  ' }), { base: QWEN, analytical: QWEN, editorial: QWEN });
});

test('ARLI_MODEL is still required (it is the fallback for both roles)', () => {
  assert.throws(() => resolveModels({ ARLI_ANALYTICAL_MODEL: DEEPSEEK, ARLI_EDITORIAL_MODEL: MIMO }), /ARLI_MODEL/);
});

test('analytical model only: analytical stages switch, editorial stages keep ARLI_MODEL', () => {
  const sel = resolveModels({ ARLI_MODEL: QWEN, ARLI_ANALYTICAL_MODEL: DEEPSEEK });
  for (const s of ANALYTICAL) assert.equal(modelForStage(sel, s), DEEPSEEK, s);
  for (const s of EDITORIAL) assert.equal(modelForStage(sel, s), QWEN, s);
});

test('editorial model only: story/polish switch, the rest keep ARLI_MODEL', () => {
  const sel = resolveModels({ ARLI_MODEL: QWEN, ARLI_EDITORIAL_MODEL: MIMO });
  for (const s of ANALYTICAL) assert.equal(modelForStage(sel, s), QWEN, s);
  for (const s of EDITORIAL) assert.equal(modelForStage(sel, s), MIMO, s);
});

test('mixed configuration and unmapped stages', () => {
  const sel = resolveModels({ ARLI_MODEL: QWEN, ARLI_ANALYTICAL_MODEL: ` ${DEEPSEEK} `, ARLI_EDITORIAL_MODEL: MIMO });
  for (const s of ANALYTICAL) assert.equal(modelForStage(sel, s), DEEPSEEK, s);
  for (const s of EDITORIAL) assert.equal(modelForStage(sel, s), MIMO, s);
  assert.equal(modelForStage(sel, 'evaluation'), QWEN);
  assert.equal(selectionLabel(sel), `${DEEPSEEK} (analytical) + ${MIMO} (editorial)`);
});

test('both roles may point to the same model', () => {
  const sel = resolveModels({ ARLI_MODEL: QWEN, ARLI_ANALYTICAL_MODEL: DEEPSEEK, ARLI_EDITORIAL_MODEL: DEEPSEEK });
  for (const s of [...ANALYTICAL, ...EDITORIAL]) assert.equal(modelForStage(sel, s), DEEPSEEK);
  assert.equal(selectionLabel(sel), DEEPSEEK);
});

test('every LLM pipeline stage has a role', () => {
  for (const s of LLM_STAGES) assert.ok(STAGE_ROLES[s], s);
});

// ── Thinking switches ────────────────────────────────────────────────────
test('thinking-off params per family', () => {
  assert.deepEqual(thinkingOffParams(QWEN), { chat_template_kwargs: { enable_thinking: false } });
  assert.deepEqual(thinkingOffParams(MIMO), { chat_template_kwargs: { enable_thinking: false } });
  assert.deepEqual(thinkingOffParams(DEEPSEEK), { chat_template_kwargs: { enable_thinking: false, thinking: false } });
  assert.deepEqual(thinkingOffParams('deepseek-v4.1-flash-1017'), { chat_template_kwargs: { enable_thinking: false, thinking: false } });
  assert.deepEqual(thinkingOffParams('Some-Unknown-Model'), { chat_template_kwargs: { enable_thinking: false } });
});

// ── Client behaviour against a stubbed fetch ─────────────────────────────
type Sent = { url: string; body: string; json: Record<string, unknown> };
let sent: Sent[] = [];
let replies: (() => Response)[] = [];
const realFetch = globalThis.fetch;
const ok = (content: string, extra: Record<string, unknown> = {}) => () =>
  new Response(JSON.stringify({ model: (extra.model as string) ?? 'echo', choices: [{ message: { content, ...((extra.message as object) ?? {}) }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 30, ...((extra.usage as object) ?? {}) } }), { status: 200 });
const status = (code: number) => () => new Response('{"error":"x"}', { status: code });

beforeEach(() => {
  sent = [];
  replies = [];
  process.env.LLM_LOG = 'off';
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = String(init.body);
    sent.push({ url, body, json: JSON.parse(body) });
    const next = replies.shift();
    if (!next) throw new Error('no scripted reply');
    return next();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.LLM_LOG;
});

const Out = z.object({ answer: z.string() });
const req = (stage: string) => ({ stage, system: 'sys', user: 'usr', schema: Out, maxTokens: 500, temperature: 0.2 });

test('Qwen request body is byte-identical to the pre-3D.1a body', async () => {
  replies.push(ok('{"answer":"a"}'));
  const llm = arliLlm({ baseUrl: 'https://arli.test/v1/', apiKey: 'k', model: QWEN });
  await llm.complete(req('plan'));
  const r = req('plan');
  const jsonSchema = z.toJSONSchema(Out, { target: 'draft-7', unrepresentable: 'any' });
  // Exactly what lib/studio/llm.ts sent before this change.
  const before = JSON.stringify({
    model: QWEN,
    chat_template_kwargs: { enable_thinking: false },
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }],
    max_tokens: r.maxTokens,
    temperature: r.temperature,
    response_format: { type: 'json_schema', json_schema: { name: 'plan', schema: jsonSchema, strict: true } },
  });
  assert.equal(sent[0].body, before);
  assert.equal(sent[0].url, 'https://arli.test/v1/chat/completions');
});

test('DeepSeek and MiMo get their own thinking switch', async () => {
  replies.push(ok('{"answer":"a"}'), ok('{"answer":"b"}'));
  await arliLlm({ baseUrl: 'u', apiKey: 'k', model: DEEPSEEK }).complete(req('plan'));
  await arliLlm({ baseUrl: 'u', apiKey: 'k', model: MIMO }).complete(req('story'));
  assert.deepEqual(sent[0].json.chat_template_kwargs, { enable_thinking: false, thinking: false });
  assert.equal(sent[0].json.model, DEEPSEEK);
  assert.deepEqual(sent[1].json.chat_template_kwargs, { enable_thinking: false });
  assert.equal(sent[1].json.model, MIMO);
});

test('roleLlm routes each stage to its role model', async () => {
  const llm = roleLlm({ baseUrl: 'u', apiKey: 'k', env: { ARLI_MODEL: QWEN, ARLI_ANALYTICAL_MODEL: DEEPSEEK, ARLI_EDITORIAL_MODEL: MIMO } });
  const stages = [...ANALYTICAL, ...EDITORIAL];
  for (const s of stages) {
    replies.push(ok('{"answer":"x"}'));
    const r = await llm.complete(req(s));
    assert.equal(r.model, EDITORIAL.includes(s) ? MIMO : DEEPSEEK, s);
  }
  assert.deepEqual(sent.map((x) => x.json.model), stages.map((s) => (EDITORIAL.includes(s) ? MIMO : DEEPSEEK)));
  assert.equal(llm.model, `${DEEPSEEK} (analytical) + ${MIMO} (editorial)`);
});

test('roleLlm with no role variables sends ARLI_MODEL with the original switch', async () => {
  const llm = roleLlm({ baseUrl: 'u', apiKey: 'k', env: { ARLI_MODEL: QWEN } });
  assert.equal(llm.model, QWEN);
  for (const s of ['plan', 'story', 'polish']) {
    replies.push(ok('{"answer":"x"}'));
    await llm.complete(req(s));
  }
  for (const x of sent) {
    assert.equal(x.json.model, QWEN);
    assert.deepEqual(x.json.chat_template_kwargs, { enable_thinking: false });
  }
});

test('calls across models stay serialised (single-request concurrency)', async () => {
  let inFlight = 0;
  let peak = 0;
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    sent.push({ url: '', body: String(init.body), json: JSON.parse(String(init.body)) });
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return ok('{"answer":"x"}')();
  }) as typeof fetch;
  const llm = roleLlm({ baseUrl: 'u', apiKey: 'k', env: { ARLI_MODEL: QWEN, ARLI_ANALYTICAL_MODEL: DEEPSEEK, ARLI_EDITORIAL_MODEL: MIMO } });
  await Promise.all(['plan', 'story', 'outlook', 'polish', 'review'].map((s) => llm.complete(req(s))));
  assert.equal(peak, 1);
  assert.equal(sent.length, 5);
});

test('reasoning tokens and finish reason are captured; reasoning despite the switch is logged as a warning', async () => {
  delete process.env.LLM_LOG;
  const warnings: string[] = [];
  const infos: string[] = [];
  const w = console.warn;
  const i = console.info;
  console.warn = (s: string) => warnings.push(s);
  console.info = (s: string) => infos.push(s);
  try {
    replies.push(ok('{"answer":"a"}', { usage: { completion_tokens_details: { reasoning_tokens: 40 } }, message: { reasoning_content: 'secret chain of thought' } }));
    const r = await arliLlm({ baseUrl: 'u', apiKey: 'k', model: DEEPSEEK }).complete(req('plan'));
    assert.equal(r.usage.reasoningTokens, 40);
    assert.equal(r.finish, 'stop');
    assert.deepEqual(llmMetric(r), { promptTokens: 120, completionTokens: 30, reasoningTokens: 40, attempts: 1, model: DEEPSEEK, finish: 'stop' });
    replies.push(ok('{"answer":"b"}'));
    const clean = await arliLlm({ baseUrl: 'u', apiKey: 'k', model: QWEN }).complete(req('story'));
    assert.equal(clean.usage.reasoningTokens, undefined);
  } finally {
    console.warn = w;
    console.info = i;
  }
  assert.equal(warnings.length, 1);
  const logged = JSON.parse(warnings[0].replace(/^\[llm\] /, ''));
  assert.equal(logged.stage, 'plan');
  assert.equal(logged.model, DEEPSEEK);
  assert.equal(logged.reasoningTokens, 40);
  assert.match(logged.warning, /reasoning/);
  assert.equal(infos.length, 1);
  // Never prompts, outputs, reasoning text or the key.
  for (const line of [...warnings, ...infos]) {
    assert.doesNotMatch(line, /secret chain|usr|sys"|"answer"|Bearer/);
  }
});

test('validation repair round is unchanged: invalid JSON, then schema feedback, then success', async () => {
  replies.push(ok('not json'), ok('{"answer":"fixed"}'));
  const r = await arliLlm({ baseUrl: 'u', apiKey: 'k', model: MIMO }).complete(req('story'));
  assert.equal(r.attempts, 2);
  assert.deepEqual(r.data, { answer: 'fixed' });
  assert.deepEqual(r.usage, { promptTokens: 240, completionTokens: 60 });
  const msgs = sent[1].json.messages as { role: string; content: string }[];
  assert.equal(msgs.length, 4);
  assert.match(msgs[3].content, /not valid JSON/);

  replies.push(ok('{"wrong":1}'), ok('{"still":"wrong"}'));
  await assert.rejects(arliLlm({ baseUrl: 'u', apiKey: 'k', model: DEEPSEEK }).complete(req('outlook')), (e: unknown) => {
    assert.ok(e instanceof LlmError);
    assert.equal(e.retryable, true);
    assert.equal(e.model, DEEPSEEK);
    assert.match(e.message, /failed validation after 2 attempts/);
    return true;
  });
});

test('json_schema rejected with 400 falls back to json_object; 5xx is retryable and carries the model', async () => {
  replies.push(status(400), ok('{"answer":"a"}'));
  await arliLlm({ baseUrl: 'u', apiKey: 'k', model: DEEPSEEK }).complete(req('plan'));
  assert.equal((sent[0].json.response_format as { type: string }).type, 'json_schema');
  assert.equal((sent[1].json.response_format as { type: string }).type, 'json_object');
  assert.deepEqual(sent[1].json.chat_template_kwargs, { enable_thinking: false, thinking: false });

  replies.push(status(503));
  await assert.rejects(arliLlm({ baseUrl: 'u', apiKey: 'k', model: MIMO }).complete(req('story')), (e: unknown) => {
    assert.ok(e instanceof LlmError);
    assert.equal(e.retryable, true);
    assert.equal(e.model, MIMO);
    return true;
  });
});

test('usage ledger records the model each stage actually used', () => {
  const deps = { llm: { model: `${DEEPSEEK} (analytical) + ${MIMO} (editorial)` }, keyFingerprints: { arli: 'fp' } } as unknown as Deps;
  const job = { id: 'j', article_id: 'a' } as Job;
  const [row] = usageRows(deps, job, 'story', { ms: 1, llm: { promptTokens: 1, completionTokens: 1, attempts: 1, model: MIMO } });
  assert.equal(row.model, MIMO);
  const [legacy] = usageRows(deps, job, 'plan', { ms: 1, llm: { promptTokens: 1, completionTokens: 1, attempts: 1 } });
  assert.equal(legacy.model, deps.llm.model);
});
