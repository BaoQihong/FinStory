'use server';

// "Fix It for Me" server action (D-055). ONE repair attempt per call; the
// publication dialog runs at most MAX_FIX_ATTEMPTS attempts and stops early
// when nothing is left to repair or an attempt made no progress.
//
// Safety: editor-only (getEditor + RLS); reads the draft from the database,
// never from the browser; bound to the revision the dialog showed; one Arli
// request at a time (shared reservation with Editorial Polish, D-049); a
// malformed model reply or a rewrite that fails the deterministic checks
// leaves the draft unchanged; the result is saved through saveDraft() as a new
// editor revision (stale-revision check, data products kept, previous
// revision retained). It never publishes and never touches published
// snapshots — publication stays an explicit human action.
import { getEditor } from '@/lib/studio/auth';
import { fingerprint } from '@/lib/studio/deps';
import { roleLlm, LlmError } from '@/lib/studio/llm';
import { modelForStage, resolveModels } from '@/lib/studio/model-roles';
import { SeshatArticleV1, StoryBrief, type SeshatArticle, type ValidationIssue } from '@/lib/studio/schema';
import { SYSTEM } from '@/lib/studio/pipeline/prompts';
import { RepairOut } from '@/lib/studio/repair';
import { applyFix, fixPrompt, issueKey, MAX_FIX_ATTEMPTS, planFix, type ClearedReason, type FixChange, type FixRejected, type ManualIssue } from '@/lib/editorial/fix';
import { checkPublication, type PublicationIssue } from '@/lib/publishing/rules';
import { saveDraft } from './actions';

const DAILY_FIX_LIMIT = 30;
const SLOT_MS = 300_000;
const today = () => new Date().toISOString().slice(0, 10);

export type FixAttemptResult =
  | {
      ok: true;
      attempt: number;
      /** A new revision was saved. */
      changed: boolean;
      revision: number;
      status: string;
      content: SeshatArticle;
      issues: ValidationIssue[];
      changes: FixChange[];
      rejected: FixRejected[];
      cleared: ClearedReason[];
      blockingBefore: number;
      resolved: number;
      blocking: PublicationIssue[];
      manual: ManualIssue[];
      /** Worth another attempt: repairable issues remain, this attempt made progress, the limit is not reached. */
      retry: boolean;
      usage?: { promptTokens: number; completionTokens: number; seconds: number };
    }
  | { ok: false; error: string };

/** feedback: the previous attempt's rejected rewrites (path + reason), so a retry is not the same request again. */
export async function fixPublicationIssues(input: { articleId: string; expectedRevision: number; attempt: number; feedback?: { path: string; why: string }[] }): Promise<FixAttemptResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const { db } = ed;
  const articleId = String(input?.articleId ?? '');
  const attempt = Number(input?.attempt);
  if (!/^[0-9a-f-]{36}$/.test(articleId) || !Number.isInteger(attempt)) return { ok: false, error: 'Invalid request.' };
  if (attempt < 1 || attempt > MAX_FIX_ATTEMPTS) return { ok: false, error: `Fix It for Me stops after ${MAX_FIX_ATTEMPTS} attempts. Correct the remaining issues in the section tabs.` };

  const { data: row } = await db.from('articles').select('revision, content, brief, is_temporary').eq('id', articleId).maybeSingle();
  if (!row) return { ok: false, error: 'Draft not found.' };
  if (row.revision !== input.expectedRevision)
    return { ok: false, error: `The draft changed while the dialog was open (now revision ${row.revision}). Nothing was repaired; reopen the publish dialog to review the latest revision.` };
  const parsed = SeshatArticleV1.safeParse(row.content);
  if (!parsed.success) return { ok: false, error: 'The draft is structurally invalid, so it cannot be repaired automatically. Fix it in the editor.' };
  const a = parsed.data;
  // Arli takes one request at a time (D-010); generation also locks the draft.
  const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
  if (active?.length) return { ok: false, error: 'A story is being generated and is using the AI model. Try again when it has finished.' };

  const before = checkPublication({ content: a, isTemporary: row.is_temporary, generating: false, today: today() });
  // Validator messages recorded earlier for this draft: an attention reason found there is validator-derived.
  const known = new Set<string>((a.validation.issues ?? []).map((i) => i.message));
  const { data: gen } = await db.from('article_revisions').select('content->validation->issues').eq('article_id', articleId).eq('origin', 'generated').order('revision', { ascending: false }).limit(1);
  for (const i of ((gen?.[0] as { issues?: { message?: string }[] } | undefined)?.issues ?? [])) if (typeof i?.message === 'string') known.add(i.message);
  const plan = planFix(a, { today: today(), isTemporary: row.is_temporary, knownReasons: known });
  const staleReasons = Object.values(plan.derived).some((rs) => rs?.length);

  let out: RepairOut | null = null;
  let usage: { promptTokens: number; completionTokens: number; seconds: number } | undefined;
  if (plan.targets.length) {
    const env = process.env;
    if (!env.ARLI_API_KEY || !env.ARLI_BASE_URL || !env.ARLI_MODEL) return { ok: false, error: 'The AI model is not configured on this server.' };
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db.from('api_usage').select('id', { count: 'exact', head: true }).eq('stage', 'fix').gte('created_at', since);
    if ((count ?? 0) >= DAILY_FIX_LIMIT) return { ok: false, error: `Daily Fix It for Me limit reached (${DAILY_FIX_LIMIT} attempts per 24 hours). Correct the issues in the section tabs.` };

    // Reuse the research already done: the generation job's data observations (no new search or data fetch).
    let observations: string[] = [];
    if (a.generation?.jobId) {
      const { data: run } = await db.from('job_stage_runs').select('output->products->observations').eq('job_id', a.generation.jobId).eq('stage', 'fetch').eq('status', 'succeeded').order('id', { ascending: false }).limit(1);
      const obs = (run?.[0] as { observations?: unknown } | undefined)?.observations;
      if (Array.isArray(obs)) observations = obs.filter((o): o is string => typeof o === 'string').slice(0, 200);
    }
    const brief = StoryBrief.safeParse(row.brief);
    const intent = brief.success ? [brief.data.argument && `Author's argument: ${brief.data.argument}`, brief.data.voice && `Tone and voice notes: ${brief.data.voice}`].filter(Boolean).join('\n') : '';
    const targetPaths = new Set(plan.targets.map((t) => t.path));
    const feedback: Record<string, string> = {};
    for (const f of (Array.isArray(input.feedback) ? input.feedback : []).slice(0, 40)) {
      const path = String(f?.path ?? '');
      if (targetPaths.has(path)) feedback[path] = String(f?.why ?? '').slice(0, 200);
    }
    const { user, items } = fixPrompt(a, plan, { observations, attempt, intent, feedback });
    const budget = Math.min(4000, 500 + Math.round(items.reduce((n, i) => n + i.text.length, 0) / 2));
    // (Prompt built before reserving the model, so nothing between the reservation and the call can throw.)
    // Reserve the model (calls = 0 marks "in flight"), exactly as Editorial Polish does.
    const { data: slot, error: slotErr } = await db
      .from('api_usage')
      .insert({ job_id: null, article_id: articleId, stage: 'fix', service: 'arli', key_fingerprint: fingerprint(env.ARLI_API_KEY), model: modelForStage(resolveModels(env), 'fix'), prompt_tokens: 0, completion_tokens: 0, credits: 0, calls: 0 })
      .select('id')
      .single();
    if (slotErr || !slot) return { ok: false, error: 'Could not reserve the AI model. Try again.' };
    const release = () => db.from('api_usage').delete().eq('id', slot.id).then(() => undefined, () => undefined);
    const { data: earlier } = await db.from('api_usage').select('id').in('stage', ['polish', 'fix']).eq('calls', 0).lt('id', slot.id).gte('created_at', new Date(Date.now() - SLOT_MS).toISOString()).limit(1);
    if (earlier?.length) {
      await release();
      return { ok: false, error: 'Another Editorial Polish or Fix It for Me request is using the AI model. Try again when it has finished.' };
    }
    const record = (u: { promptTokens: number; completionTokens: number }, calls: number) =>
      u.promptTokens || u.completionTokens
        ? db.from('api_usage').update({ prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, calls: Math.max(1, calls) }).eq('id', slot.id).then(() => undefined, () => undefined)
        : release();

    const llm = roleLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, env, timeoutMs: 150_000 });
    try {
      const r = await llm.complete({ stage: 'fix', system: SYSTEM, user, schema: RepairOut, maxTokens: budget, temperature: 0.1 });
      await record(r.usage, r.attempts);
      out = r.data;
      usage = { ...r.usage, seconds: Math.round(r.ms / 1000) };
    } catch (e) {
      await (e instanceof LlmError ? record(e.usage, 2) : release());
      return { ok: false, error: `The AI model did not return a usable repair (${(e as Error).message.slice(0, 160)}). Your draft is unchanged.` };
    }
  } else if (!staleReasons) {
    // Nothing Fix It may change: report what needs the editor.
    return { ok: true, attempt, changed: false, revision: row.revision, status: '', content: a, issues: a.validation.issues, changes: [], rejected: [], cleared: [], blockingBefore: before.blocking.length, resolved: 0, blocking: before.blocking, manual: plan.manual, retry: false };
  }

  const applied = applyFix(a, plan, out, { today: today() });
  if (!applied.ok) return { ok: false, error: applied.error };
  const changed = applied.changes.length > 0 || applied.cleared.length > 0;
  let revision = row.revision;
  let status = '';
  let content = a;
  let issues = a.validation.issues;
  if (changed) {
    const what = [
      applied.changes.length ? `rewrote ${applied.changes.map((c) => c.path).join(', ')}` : '',
      applied.cleared.length ? `cleared ${applied.cleared.length} resolved attention note(s)` : '',
    ].filter(Boolean).join('; ');
    const note = `Fix It for Me (attempt ${attempt} of ${MAX_FIX_ATTEMPTS}): ${what}.`.slice(0, 500);
    // saveDraft re-checks the revision (stale-write protection), the generation lock and the schema, and keeps the data products.
    const saved = await saveDraft(articleId, row.revision, applied.content, note, { revalidate: false });
    if (!saved.ok) return { ok: false, error: `${saved.error} Nothing was repaired.` };
    revision = saved.revision;
    status = saved.status;
    content = saved.content;
    issues = saved.issues;
  }
  const after = checkPublication({ content, isTemporary: row.is_temporary, generating: false, today: today() });
  const left = new Set(after.blocking.map(issueKey));
  const resolved = before.blocking.filter((i) => !left.has(issueKey(i))).length;
  const nextPlan = changed ? planFix(content, { today: today(), isTemporary: row.is_temporary, knownReasons: known }) : plan;
  // Progress = fewer blocking issues, or fewer problems behind them (an attention flag clears only when all its reasons do).
  const work = (p: typeof plan) => p.targets.reduce((n, t) => n + t.problems.length, 0);
  const progress = after.blocking.length < before.blocking.length || work(nextPlan) < work(plan);
  // A rejected rewrite is retried once more with the reason as feedback (still capped at MAX_FIX_ATTEMPTS).
  const retry = attempt < MAX_FIX_ATTEMPTS && nextPlan.targets.length > 0 && ((changed && progress) || applied.rejected.length > 0);
  return { ok: true, attempt, changed, revision, status, content, issues, changes: applied.changes, rejected: applied.rejected, cleared: applied.cleared, blockingBefore: before.blocking.length, resolved, blocking: after.blocking, manual: nextPlan.manual, retry, usage };
}
