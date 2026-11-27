'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getEditor } from '@/lib/studio/auth';
import { DAILY_JOB_LIMIT, missingConfig } from '@/lib/studio/deps';
import { SECTION_ORDER, SeshatArticleV1, StoryBrief, type ValidationIssue } from '@/lib/studio/schema';
import { validateArticle } from '@/lib/studio/validate';
import { supabaseServer } from '@/lib/supabase/server';

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

// ── Auth ──────────────────────────────────────────────────────────────────
export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Sign-in failed. Check your email and password.' };
  const ed = await getEditor();
  if (!ed) {
    await db.auth.signOut();
    return { error: 'This account is not authorised to use the Seshat studio.' };
  }
  redirect('/admin');
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect('/admin/login');
}

// ── Story creation ───────────────────────────────────────────────────────
export async function createStory(_prev: FormState, form: FormData): Promise<FormState> {
  const ed = await getEditor();
  if (!ed) return { error: 'Your session has expired. Sign in again.' };
  const raw = Object.fromEntries(['prompt', 'headline', 'audience', 'angle', 'questions', 'assets', 'instructions'].map((k) => [k, String(form.get(k) ?? '').trim() || undefined]));
  const parsed = StoryBrief.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: 'Please check the brief.', fieldErrors };
  }
  const missing = missingConfig();
  if (missing.length) return { error: `The generation engine is not configured on this server (missing: ${missing.join(', ')}).` };

  const { db } = ed;
  const { data: active } = await db.from('generation_jobs').select('id, article_id').in('status', ['queued', 'running']).limit(1);
  if (active?.length) return { error: 'Another story is being generated. Wait for it to finish (or cancel it) before starting a new one.' };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('generation_jobs').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) >= DAILY_JOB_LIMIT) return { error: `Daily generation limit reached (${DAILY_JOB_LIMIT} per 24 hours). This protects API costs; try again later.` };

  const brief = parsed.data;
  const title = (brief.headline || brief.prompt).slice(0, 120);
  const { data: article, error: aErr } = await db.from('articles').insert({ working_title: title, brief, status: 'generating' }).select('id').single();
  if (aErr || !article) return { error: `Could not create the draft: ${aErr?.message}` };
  const { error: jErr } = await db.from('generation_jobs').insert({ article_id: article.id });
  if (jErr) {
    await db.from('articles').delete().eq('id', article.id);
    return { error: /one_active/.test(jErr.message) ? 'Another story is being generated. Try again when it has finished.' : `Could not start generation: ${jErr.message}` };
  }
  revalidatePath('/admin');
  redirect(`/admin/drafts/${article.id}`);
}

// ── Editorial saves ──────────────────────────────────────────────────────
export type SaveResult = { ok: true; revision: number; issues: ValidationIssue[]; status: string } | { ok: false; error: string; issues?: ValidationIssue[] };

export async function saveDraft(articleId: string, expectedRevision: number, content: unknown, note?: string): Promise<SaveResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again (your edits are still in this tab).' };
  const { db } = ed;
  const { data: current, error } = await db.from('articles').select('revision, status, content').eq('id', articleId).maybeSingle();
  if (error || !current) return { ok: false, error: 'Draft not found.' };
  if (current.revision !== expectedRevision)
    return { ok: false, error: `This draft changed since you opened it (now revision ${current.revision}). Reload to see the latest version before saving.` };
  const { data: running } = await db.from('generation_jobs').select('id').eq('article_id', articleId).in('status', ['queued', 'running']).limit(1);
  if (running?.length) return { ok: false, error: 'Generation is still running for this draft; edits are locked until it finishes.' };

  const parsed = SeshatArticleV1.safeParse(content);
  if (!parsed.success) {
    return { ok: false, error: 'The draft could not be saved because some fields are invalid.', issues: parsed.error.issues.slice(0, 20).map((i) => ({ level: 'error', section: 'evidence', code: 'schema', message: `${i.path.join('.')}: ${i.message}` })) };
  }
  // Data products are application-owned: editors change copy and placement, never values.
  const prev = current.content as { data?: unknown } | null;
  const next = { ...parsed.data, data: prev?.data ?? parsed.data.data, meta: { ...parsed.data.meta, updatedAt: new Date().toISOString() } };
  const v = validateArticle(next, { today: new Date().toISOString().slice(0, 10) });
  next.validation = { checkedAt: new Date().toISOString(), issues: v.issues, claims: v.claims };
  const needs = SECTION_ORDER.some((s) => next[s].attention.required) || v.issues.some((i) => i.level === 'error');
  const status = needs ? 'needs_attention' : 'draft';
  const revision = expectedRevision + 1;
  const { error: rErr } = await db.from('article_revisions').insert({ article_id: articleId, revision, origin: 'editor', content: next, note: note ?? null });
  if (rErr) return { ok: false, error: /duplicate/.test(rErr.message) ? 'Someone saved this draft at the same time. Reload before saving.' : rErr.message };
  const { error: uErr } = await db.from('articles').update({ content: next, revision, status, working_title: next.meta.workingTitle, as_of: next.meta.asOf }).eq('id', articleId).eq('revision', expectedRevision);
  if (uErr) return { ok: false, error: uErr.message };
  revalidatePath(`/admin/drafts/${articleId}`);
  return { ok: true, revision, issues: v.issues, status };
}

// ── Job control ──────────────────────────────────────────────────────────
export async function retryJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Not signed in.' };
  const { db } = ed;
  const { data: job } = await db.from('generation_jobs').select('status, stage, attempts, article_id').eq('id', jobId).maybeSingle();
  if (!job || job.status !== 'failed') return { ok: false, error: 'Only a failed job can be retried.' };
  const attempts = { ...(job.attempts as Record<string, number>), [job.stage]: 0 };
  const { error } = await db.from('generation_jobs').update({ status: 'running', error: null, attempts, finished_at: null, lease_token: null, lease_expires_at: null }).eq('id', jobId).eq('status', 'failed');
  if (error) return { ok: false, error: /one_active/.test(error.message) ? 'Another generation is running; retry when it has finished.' : error.message };
  await db.from('articles').update({ status: 'generating' }).eq('id', job.article_id).is('content', null);
  revalidatePath(`/admin/drafts/${job.article_id}`);
  return { ok: true };
}

export async function cancelJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Not signed in.' };
  const { db } = ed;
  const { data: job } = await db.from('generation_jobs').select('article_id').eq('id', jobId).maybeSingle();
  const { error } = await db.from('generation_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', jobId).in('status', ['queued', 'running']);
  if (error) return { ok: false, error: error.message };
  if (job) await db.from('articles').update({ status: 'generation_failed' }).eq('id', job.article_id).is('content', null);
  revalidatePath('/admin');
  return { ok: true };
}
