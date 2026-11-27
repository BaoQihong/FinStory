// Print the API usage ledger by service and key fingerprint, and per draft (editor session).
// Usage: node scripts/studio/usage-report.ts
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
const env = readEnv() as Record<string, string>;
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
const { data: rows } = await db.from('api_usage').select('*');
const { data: arts } = await db.from('articles').select('id, working_title, is_temporary, status');
const agg = new Map<string, { calls: number; pt: number; ct: number; credits: number }>();
for (const r of rows ?? []) {
  const k = `${r.service.padEnd(7)} ${r.key_fingerprint}`;
  const a = agg.get(k) ?? { calls: 0, pt: 0, ct: 0, credits: 0 };
  a.calls += r.calls; a.pt += r.prompt_tokens; a.ct += r.completion_tokens; a.credits += Number(r.credits);
  agg.set(k, a);
}
console.log('BY SERVICE / KEY FINGERPRINT');
for (const [k, a] of agg) console.log(`  ${k}  calls ${a.calls}${a.pt + a.ct ? `  tokens ${a.pt} in + ${a.ct} out = ${a.pt + a.ct}` : ''}${a.credits ? `  credits ${a.credits}` : ''}`);
console.log('BY DRAFT');
for (const art of arts ?? []) {
  const mine = (rows ?? []).filter((r) => r.article_id === art.id);
  const tok = mine.filter((r) => r.service === 'arli').reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0);
  const cr = mine.filter((r) => r.service === 'tavily').reduce((s, r) => s + Number(r.credits), 0);
  const dc = mine.filter((r) => !['arli', 'tavily'].includes(r.service)).reduce((s, r) => s + r.calls, 0);
  console.log(`  ${art.is_temporary ? '[temp] ' : ''}${art.working_title.slice(0, 60)} (${art.status}) — arli ${tok} tokens, tavily ${cr} credits, data calls ${dc}`);
}
await db.auth.signOut();
