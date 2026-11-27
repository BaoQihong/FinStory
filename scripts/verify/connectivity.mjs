// End-to-end connectivity check for FinStory infrastructure.
// Reads .env.local; prints PASS/FAIL/SKIP per check. Never prints secret values.
//
// Usage (from repo root):  node scripts/verify/connectivity.mjs [--only=supabase,db,arli]
import { execSync } from 'node:child_process';
import { readEnv, isSet } from '../lib/env-file.mjs';

const env = readEnv();
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (name) => !only.length || only.includes(name);
const results = [];
const record = (check, status, detail = '') => {
  results.push({ check, status, detail });
  console.log(`${status.padEnd(4)}  ${check}${detail ? ' — ' + detail : ''}`);
};

/** Strip anything that looks like a credential from text before printing. */
const secretValues = Object.entries(env)
  .filter(([k, v]) => /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/.test(k) && v && v.length > 8)
  .map(([, v]) => v);
const redact = (s) => {
  let out = String(s);
  for (const v of secretValues) out = out.split(v).join('***');
  return out.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g, '$1***@');
};

async function req(url, opts = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── Supabase REST/Auth ─────────────────────────────────────
if (want('supabase')) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const sec = env.SUPABASE_SECRET_KEY;
  if (!isSet(url)) record('Supabase URL', 'SKIP', 'NEXT_PUBLIC_SUPABASE_URL not set');
  else {
    if (!isSet(pub)) record('Supabase publishable key', 'SKIP', 'not set');
    else {
      try {
        const r = await req(`${url}/auth/v1/settings`, { headers: { apikey: pub } });
        record('Supabase publishable key', r.ok ? 'PASS' : 'FAIL', `GET /auth/v1/settings → HTTP ${r.status}`);
      } catch (e) {
        record('Supabase publishable key', 'FAIL', redact(e.message));
      }
    }
    if (!isSet(sec)) record('Supabase secret key', 'SKIP', 'not set');
    else {
      try {
        const r = await req(`${url}/auth/v1/admin/users?page=1&per_page=1`, { headers: { apikey: sec } });
        record('Supabase secret key', r.ok ? 'PASS' : 'FAIL', `GET /auth/v1/admin/users → HTTP ${r.status}`);
      } catch (e) {
        record('Supabase secret key', 'FAIL', redact(e.message));
      }
    }
  }
}

// ── Postgres (via Supabase CLI, no npm deps) ───────────────
if (want('db')) {
  const dbUrl = env.DATABASE_URL;
  if (!isSet(dbUrl)) record('Postgres DATABASE_URL', 'SKIP', 'not set');
  else {
    try {
      execSync(`supabase migration list --remote="${dbUrl}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
      record('Postgres DATABASE_URL', 'PASS', 'connected (supabase migration list)');
    } catch (e) {
      const msg = redact((e.stderr || e.message || '').toString().split('\n').filter(Boolean).slice(-2).join(' | '));
      record('Postgres DATABASE_URL', 'FAIL', msg);
    }
  }
}

// ── Arli AI (OpenAI-compatible) ────────────────────────────
if (want('arli')) {
  const base = (env.ARLI_BASE_URL || '').replace(/\/+$/, '');
  const key = env.ARLI_API_KEY;
  const model = env.ARLI_MODEL;
  if (!isSet(key) || !isSet(base)) record('Arli AI', 'SKIP', 'ARLI_API_KEY / ARLI_BASE_URL not set');
  else {
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    try {
      const r = await req(`${base}/models`, { headers });
      let ids = [];
      if (r.ok) ids = ((await r.json()).data ?? []).map((m) => m.id);
      record('Arli AI models endpoint', r.ok ? 'PASS' : 'FAIL', `GET /models → HTTP ${r.status}${r.ok ? `, ${ids.length} models` : ''}`);
      if (r.ok && isSet(model)) {
        record('Arli AI model id', ids.includes(model) ? 'PASS' : 'WARN', ids.includes(model) ? `${model} listed` : `${model} not in /models list`);
      }
      if (process.argv.includes('--list-models')) {
        const q = ids.filter((id) => /qwen/i.test(id));
        console.log(`\nQwen models available (${q.length}):\n  ` + q.join('\n  '));
      }
    } catch (e) {
      record('Arli AI models endpoint', 'FAIL', redact(e.message));
    }
    if (!isSet(model)) record('Arli AI chat completion', 'SKIP', 'ARLI_MODEL not set');
    else {
      try {
        const t0 = Date.now();
        const r = await req(
          `${base}/chat/completions`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }],
              // Qwen3-family models reason before answering by default; the
              // reasoning consumes max_tokens. Ask the server to skip it
              // (vLLM chat_template_kwargs) and leave headroom regardless.
              max_tokens: 512,
              temperature: 0,
              chat_template_kwargs: { enable_thinking: false },
            }),
          },
          120000,
        );
        const body = await r.text();
        if (!r.ok) record('Arli AI chat completion', 'FAIL', `HTTP ${r.status}: ${redact(body).slice(0, 200)}`);
        else {
          const j = JSON.parse(body);
          const text = (j.choices?.[0]?.message?.content ?? '').trim().slice(0, 60);
          const reasoning = j.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
          record(
            'Arli AI chat completion',
            text ? 'PASS' : 'FAIL',
            `HTTP 200 in ${Date.now() - t0} ms, reply: "${text}", tokens: ${j.usage?.total_tokens ?? '?'} (reasoning ${reasoning}), finish: ${j.choices?.[0]?.finish_reason}`,
          );
        }
      } catch (e) {
        record('Arli AI chat completion', 'FAIL', redact(e.message));
      }
    }
  }
}

const failed = results.filter((r) => r.status === 'FAIL').length;
const skipped = results.filter((r) => r.status === 'SKIP').length;
console.log(`\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
