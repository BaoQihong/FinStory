'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getEditor } from '@/lib/studio/auth';
import { DAILY_JOB_LIMIT, fingerprint, missingConfig } from '@/lib/studio/deps';
import { SECTION_ORDER, SeshatArticleV1, StoryBrief, type SeshatArticle, type ValidationIssue } from '@/lib/studio/schema';
import { validateArticle } from '@/lib/studio/validate';
import { supabaseServer } from '@/lib/supabase/server';
import { CONTEXT_FIELDS, suggestBrief, type BriefSuggestion, type ContextField } from '@/lib/studio/brief';
import { arliLlm, LlmError } from '@/lib/studio/llm';


/** An Editorial Polish or Fix It for Me call is using the AI model (reservation row, see polish-actions.ts / fix-actions.ts). */
async function polishInFlight(db: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data } = await db.from('api_usage').select('id').in('stage', ['polish', 'fix']).eq('calls', 0).gte('created_at', new Date(Date.now() - 300_000).toISOString()).limit(1);
  return !!data?.length;
}

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
  const raw = Object.fromEntries(['prompt', 'headline', 'audience', 'angle', 'questions', 'assets', 'indicators', 'outlook', 'premise', 'instructions', 'argument', 'voice'].map((k) => [k, String(form.get(k) ?? '').trim() || undefined]));
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
  if (await polishInFlight(db)) return { error: 'Editorial Polish is using the AI model right now. Start the generation when it has finished.' };
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

// ── Editorial brief builder ──────────────────────────────────────────────
// One lightweight Arli call that suggests brief fields from the story idea.
// No search, no data, no pipeline: see lib/studio/brief.ts.
export type BriefResult = { ok: true; fields: BriefSuggestion } | { ok: false; error: string };
const DAILY_BRIEF_LIMIT = 60;

export async function developBrief(input: { prompt: string; context?: Partial<Record<string, string>> }): Promise<BriefResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again (your text is still in this tab).' };
  const prompt = String(input?.prompt ?? '').trim();
  if (prompt.length < 20) return { ok: false, error: 'Describe the story in at least a sentence (20+ characters) first.' };
  if (prompt.length > 4000) return { ok: false, error: 'The story prompt is too long (4,000 characters maximum).' };
  const context: Partial<Record<ContextField, string>> = {};
  for (const k of CONTEXT_FIELDS) {
    const v = String(input?.context?.[k] ?? '').trim();
    if (v) context[k] = v.slice(0, 1500);
  }
  const env = process.env;
  if (!env.ARLI_API_KEY || !env.ARLI_BASE_URL || !env.ARLI_MODEL) return { ok: false, error: 'The AI model is not configured on this server.' };

  const { db } = ed;
  // Arli allows one request at a time (D-010): never run beside a generation job.
  const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
  if (active?.length) return { ok: false, error: 'A story is being generated and is using the AI model. Develop the brief when it has finished — or write the guidance yourself.' };
  if (await polishInFlight(db)) return { ok: false, error: 'Editorial Polish is using the AI model right now. Try again in a minute.' };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('api_usage').select('id', { count: 'exact', head: true }).eq('stage', 'brief').gte('created_at', since);
  if ((count ?? 0) >= DAILY_BRIEF_LIMIT) return { ok: false, error: `Daily brief limit reached (${DAILY_BRIEF_LIMIT} per 24 hours). You can still write the guidance yourself.` };

  const llm = arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model: env.ARLI_MODEL, timeoutMs: 90_000 });
  const record = (u: { promptTokens: number; completionTokens: number }, calls: number) =>
    u.promptTokens || u.completionTokens
      ? db
          .from('api_usage')
          .insert({ job_id: null, article_id: null, stage: 'brief', service: 'arli', key_fingerprint: fingerprint(env.ARLI_API_KEY), model: env.ARLI_MODEL, prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, credits: 0, calls })
          .then(() => undefined, () => undefined)
      : undefined;
  try {
    const r = await suggestBrief(llm, { prompt, context });
    await record(r.usage, r.attempts);
    return { ok: true, fields: r.fields };
  } catch (e) {
    if (e instanceof LlmError) await record(e.usage, 2);
    return { ok: false, error: `Seshat could not develop the brief this time (${(e as Error).message.slice(0, 160)}). Try again, or go straight to Research & Generate.` };
  }
}

// ── Editorial saves ──────────────────────────────────────────────────────
export type SaveResult = { ok: true; revision: number; issues: ValidationIssue[]; status: string; content: SeshatArticle } | { ok: false; error: string; issues?: ValidationIssue[] };

/** opts.revalidate = false: the caller updates the open page itself (Fix It keeps the publication dialog open). */
export async function saveDraft(articleId: string, expectedRevision: number, content: unknown, note?: string, opts?: { revalidate?: boolean }): Promise<SaveResult> {
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
  const next: SeshatArticle = { ...parsed.data, data: (prev?.data as SeshatArticle['data'] | undefined) ?? parsed.data.data, meta: { ...parsed.data.meta, updatedAt: new Date().toISOString() } };
  const v = validateArticle(next, { today: new Date().toISOString().slice(0, 10) });
  next.validation = { checkedAt: new Date().toISOString(), issues: v.issues, claims: v.claims };
  const needs = SECTION_ORDER.some((s) => next[s].attention.required) || v.issues.some((i) => i.level === 'error');
  const status = needs ? 'needs_attention' : 'draft';
  const revision = expectedRevision + 1;
  const { error: rErr } = await db.from('article_revisions').insert({ article_id: articleId, revision, origin: 'editor', content: next, note: note ?? null });
  if (rErr) return { ok: false, error: /duplicate/.test(rErr.message) ? 'Someone saved this draft at the same time. Reload before saving.' : rErr.message };
  const { error: uErr } = await db.from('articles').update({ content: next, revision, status, working_title: next.meta.workingTitle, as_of: next.meta.asOf }).eq('id', articleId).eq('revision', expectedRevision);
  if (uErr) return { ok: false, error: uErr.message };
  if (opts?.revalidate !== false) revalidatePath(`/admin/drafts/${articleId}`);
  return { ok: true, revision, issues: v.issues, status, content: next };
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
