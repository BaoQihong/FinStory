// Ensure the single Seshat editor exists in Supabase Auth and in public.editors,
// then verify the RLS boundary from both sides. Never prints secret values.
//
// Reads EDITOR_EMAIL / EDITOR_PASSWORD / SUPABASE_SECRET_KEY from .env.local.
// Usage (from repo root):  node scripts/setup/create-editor.mjs [--verify-only]
import { readEnv } from '../lib/env-file.mjs';

const e = readEnv();
const base = e.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: e.SUPABASE_SECRET_KEY, Authorization: `Bearer ${e.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' };
const pub = { apikey: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
const verifyOnly = process.argv.includes('--verify-only');
const line = (s, ok, d) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}${d ? ' — ' + d : ''}`);
let failures = 0;
const check = (s, ok, d) => { line(s, ok, d); if (!ok) failures++; };

// 1. Auth user
const list = await (await fetch(`${base}/auth/v1/admin/users?page=1&per_page=200`, { headers: admin })).json();
let user = list.users?.find((u) => u.email?.toLowerCase() === e.EDITOR_EMAIL.toLowerCase());
if (!user && !verifyOnly) {
  const r = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST', headers: admin,
    body: JSON.stringify({ email: e.EDITOR_EMAIL, password: e.EDITOR_PASSWORD, email_confirm: true }),
  });
  user = await r.json();
  check('create auth user', r.ok, `HTTP ${r.status}`);
}
check('editor auth user exists', !!user?.id);

// 2. Allow-list row (service key bypasses RLS)
if (!verifyOnly) {
  const r = await fetch(`${base}/rest/v1/editors?on_conflict=user_id`, {
    method: 'POST', headers: { ...admin, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: user.id, display_name: 'Seshat Editorial' }),
  });
  check('editors row upserted', r.ok, `HTTP ${r.status}`);
}

// 3. RLS from the anonymous side: no rows, or refused outright
for (const t of ['articles', 'generation_jobs', 'research_sources', 'datasets', 'article_revisions', 'editors']) {
  const r = await fetch(`${base}/rest/v1/${t}?select=*&limit=1`, { headers: pub });
  const body = await r.json().catch(() => null);
  const blocked = !r.ok || (Array.isArray(body) && body.length === 0);
  check(`anon cannot read ${t}`, blocked, `HTTP ${r.status}`);
}
const anonInsert = await fetch(`${base}/rest/v1/articles`, { method: 'POST', headers: pub, body: JSON.stringify({ working_title: 'x', brief: {} }) });
check('anon cannot insert articles', !anonInsert.ok, `HTTP ${anonInsert.status}`);

// 4. RLS from the editor side
const tok = await (await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: pub, body: JSON.stringify({ email: e.EDITOR_EMAIL, password: e.EDITOR_PASSWORD }),
})).json();
check('editor sign-in', !!tok.access_token);
if (tok.access_token) {
  const ed = { ...pub, Authorization: `Bearer ${tok.access_token}` };
  const isEd = await fetch(`${base}/rest/v1/rpc/is_editor`, { method: 'POST', headers: ed, body: '{}' });
  check('is_editor() true for editor', (await isEd.json()) === true);
  const r = await fetch(`${base}/rest/v1/articles?select=id&limit=1`, { headers: ed });
  check('editor can read articles', r.ok, `HTTP ${r.status}`);
}
process.exit(failures ? 1 : 0);
