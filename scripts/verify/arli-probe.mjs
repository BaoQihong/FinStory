// Probe Arli AI capabilities (sequential requests only — single-concurrency constraint).
// Prints configuration facts and timings; never prints secret values.
import { readEnv } from '../lib/env-file.mjs';
const env = readEnv();
const base = env.ARLI_BASE_URL, key = env.ARLI_API_KEY, model = env.ARLI_MODEL;
console.log('model configured:', model);
const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const mr = await fetch(`${base}/models`, { headers: H });
const models = (await mr.json()).data?.map((m) => m.id) ?? [];
console.log('model listed by API:', models.includes(model), `(${models.length} models)`);

async function chat(label, body) {
  const t0 = Date.now();
  const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: H, body: JSON.stringify({ model, ...body }) });
  const ms = Date.now() - t0;
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = null; }
  const content = j?.choices?.[0]?.message?.content ?? '';
  console.log(`\n[${label}] HTTP ${r.status} in ${ms} ms; finish=${j?.choices?.[0]?.finish_reason}; usage=${JSON.stringify(j?.usage)}`);
  if (!r.ok) console.log('error body:', text.slice(0, 400));
  else console.log('content head:', JSON.stringify(content.slice(0, 300)));
  if (j?.usage?.completion_tokens) console.log('tokens/sec ≈', (j.usage.completion_tokens / (ms / 1000)).toFixed(1));
  return { r, content };
}
const nothink = { chat_template_kwargs: { enable_thinking: false } };
const schema = { type: 'object', properties: { city: { type: 'string' }, reasons: { type: 'array', items: { type: 'string' } } }, required: ['city', 'reasons'], additionalProperties: false };
await chat('json_schema', { ...nothink, max_tokens: 300, messages: [{ role: 'user', content: 'Name a capital city and two reasons it is notable. Reply as JSON.' }], response_format: { type: 'json_schema', json_schema: { name: 'x', schema, strict: true } } });
await chat('json_object', { ...nothink, max_tokens: 300, messages: [{ role: 'user', content: 'Name a capital city and two reasons it is notable. Reply as JSON {"city":..., "reasons":[...]}.' }], response_format: { type: 'json_object' } });
await chat('long-output speed', { ...nothink, max_tokens: 1200, messages: [{ role: 'user', content: 'Write about 700 words explaining how central bank interest rates affect currency exchange rates. Plain prose.' }] });
