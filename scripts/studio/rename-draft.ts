// Rename drafts' working titles under the editor session (used to label superseded test drafts).
// Usage: node scripts/studio/rename-draft.ts <articleId> "<new working title>"
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
const env = readEnv() as Record<string, string>;
const [id, title] = process.argv.slice(2);
if (!id || !title) throw new Error('usage: rename-draft.ts <articleId> "<title>"');
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
const { error } = await db.from('articles').update({ working_title: title }).eq('id', id);
console.log(error ? `FAIL ${error.message}` : `renamed ${id} → ${title}`);
await db.auth.signOut();
