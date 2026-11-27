// Data Access Layer guard for the editorial studio. Every studio page, server
// action and route handler calls requireEditor(); hiding routes in the UI is
// never relied upon. Authorization = a verified Supabase user who is in
// public.editors (the same check RLS applies via is_editor()).
import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServer, type ServerSupabase } from '@/lib/supabase/server';

export type Editor = { id: string; email: string; name: string };

export async function getEditor(): Promise<{ editor: Editor; db: ServerSupabase } | null> {
  const db = await supabaseServer();
  const { data, error } = await db.auth.getUser(); // verifies the JWT with Supabase Auth
  if (error || !data.user) return null;
  const { data: row } = await db.from('editors').select('display_name').eq('user_id', data.user.id).maybeSingle();
  if (!row) return null;
  return { editor: { id: data.user.id, email: data.user.email ?? '', name: row.display_name }, db };
}

/** For pages: redirect to the login screen when not an editor. */
export async function requireEditor() {
  const r = await getEditor();
  if (!r) redirect('/admin/login');
  return r;
}
