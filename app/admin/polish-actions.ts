'use server';

// Editorial Polish server actions (Phase 3B.2, D-049).
//
// proposePolish: one Arli call that proposes revised prose for ONE section of
// the working draft. It reads the draft from the database (never from the
// browser), writes nothing to the article, and returns a proposal bound to the
// revision it was made from. applyPolish: the editor's accepted subset, applied
// only if the draft is still at that revision and each field still holds the
// text the proposal was based on; saved through saveDraft() as an ordinary
// editor revision. Nothing here publishes: publication columns are guarded by
// the database trigger and only publish_article() may set them (D-045).
import { getEditor } from '@/lib/studio/auth';
import { fingerprint } from '@/lib/studio/deps';
import { arliLlm, LlmError } from '@/lib/studio/llm';
import { SECTION_LABELS, SECTION_ORDER, SeshatArticleV1, StoryBrief, type SectionId, type SeshatArticle, type ValidationIssue } from '@/lib/studio/schema';
import { SYSTEM } from '@/lib/studio/pipeline/prompts';
import { applyRevisions, buildProposal, polishPrompt, PolishOut, type AcceptedRevision, type PolishProposal } from '@/lib/editorial/polish';
import { saveDraft } from './actions';

const DAILY_POLISH_LIMIT = 40;
/** A reservation older than this is treated as abandoned (call timeout 240 s + one repair round margin). */
const POLISH_IN_FLIGHT_MS = 300_000;
const isSection = (s: unknown): s is SectionId => typeof s === 'string' && (SECTION_ORDER as readonly string[]).includes(s);

export type ProposeResult = ({ ok: true } & PolishProposal & { usage: { promptTokens: number; completionTokens: number; seconds: number } }) | { ok: false; error: string };

export async function proposePolish(input: { articleId: string; expectedRevision: number; section: SectionId }): Promise<ProposeResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const { db } = ed;
  const articleId = String(input?.articleId ?? '');
  if (!/^[0-9a-f-]{36}$/.test(articleId) || !isSection(input?.section)) return { ok: false, error: 'Invalid request.' };
  const env = process.env;
  if (!env.ARLI_API_KEY || !env.ARLI_BASE_URL || !env.ARLI_MODEL) return { ok: false, error: 'The AI model is not configured on this server.' };

  const { data: row } = await db.from('articles').select('revision, content, brief').eq('id', articleId).maybeSingle();
  if (!row) return { ok: false, error: 'Draft not found.' };
  if (row.revision !== input.expectedRevision) return { ok: false, error: `The draft is now at revision ${row.revision}. Reload before polishing so the proposal is based on the latest text.` };
  const parsed = SeshatArticleV1.safeParse(row.content);
  if (!parsed.success) return { ok: false, error: 'The draft content is not valid; fix it before polishing.' };

  // Arli allows one request at a time (D-010): never beside a generation job.
  const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
  if (active?.length) return { ok: false, error: 'A story is being generated and is using the AI model. Polish when it has finished.' };
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('api_usage').select('id', { count: 'exact', head: true }).eq('stage', 'polish').gte('created_at', since);
  if ((count ?? 0) >= DAILY_POLISH_LIMIT) return { ok: false, error: `Daily Editorial Polish limit reached (${DAILY_POLISH_LIMIT} per 24 hours).` };

  const brief = StoryBrief.safeParse(row.brief);
  const { user, fields } = polishPrompt(parsed.data, input.section, brief.success ? brief.data : null);
  if (!fields.length) return { ok: false, error: `${SECTION_LABELS[input.section]} has no prose to polish.` };

  // Serialise across tabs and server instances (Arli: one request at a time, D-010): reserve a usage row
  // first (calls = 0 marks "in flight"); if an earlier reservation is still in flight, back off.
  const { data: slot, error: slotErr } = await db
    .from('api_usage')
    .insert({ job_id: null, article_id: articleId, stage: 'polish', service: 'arli', key_fingerprint: fingerprint(env.ARLI_API_KEY), model: env.ARLI_MODEL, prompt_tokens: 0, completion_tokens: 0, credits: 0, calls: 0 })
    .select('id')
    .single();
  if (slotErr || !slot) return { ok: false, error: 'Could not reserve the AI model. Try again.' };
  const release = () => db.from('api_usage').delete().eq('id', slot.id).then(() => undefined, () => undefined);
  const { data: earlier } = await db.from('api_usage').select('id').eq('stage', 'polish').eq('calls', 0).lt('id', slot.id).gte('created_at', new Date(Date.now() - POLISH_IN_FLIGHT_MS).toISOString()).limit(1);
  if (earlier?.length) {
    await release();
    return { ok: false, error: 'Another Editorial Polish request is still running (the AI model takes one request at a time). Try again when it has finished.' };
  }

  const llm = arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model: env.ARLI_MODEL, timeoutMs: 240_000 });
  const record = (u: { promptTokens: number; completionTokens: number }, calls: number) =>
    u.promptTokens || u.completionTokens
      ? db.from('api_usage').update({ prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, calls: Math.max(1, calls) }).eq('id', slot.id).then(() => undefined, () => undefined)
      : release();
  const budget = Math.min(6000, 600 + Math.round(fields.reduce((n, f) => n + f.text.length, 0) / 2.5));
  try {
    const r = await llm.complete({ stage: 'polish', system: SYSTEM, user, schema: PolishOut, maxTokens: budget, temperature: 0.5 });
    await record(r.usage, r.attempts);
    const proposal = buildProposal(parsed.data, input.section, row.revision, r.data);
    return { ok: true, ...proposal, usage: { ...r.usage, seconds: Math.round(r.ms / 1000) } };
  } catch (e) {
    await (e instanceof LlmError ? record(e.usage, 2) : release());
    return { ok: false, error: `Editorial Polish could not produce a usable proposal this time (${(e as Error).message.slice(0, 160)}). Your draft is unchanged.` };
  }
}

export type ApplyResult = { ok: true; revision: number; status: string; issues: ValidationIssue[]; content: SeshatArticle; applied: number } | { ok: false; error: string };

export async function applyPolish(input: { articleId: string; baseRevision: number; section: SectionId; accepted: AcceptedRevision[]; proposed: number; styleGuideVersion: string }): Promise<ApplyResult> {
  const ed = await getEditor();
  if (!ed) return { ok: false, error: 'Your session has expired. Sign in again.' };
  const articleId = String(input?.articleId ?? '');
  if (!/^[0-9a-f-]{36}$/.test(articleId) || !isSection(input?.section)) return { ok: false, error: 'Invalid request.' };
  const accepted = (Array.isArray(input.accepted) ? input.accepted : []).slice(0, 60).map((r) => ({ path: String(r?.path ?? ''), before: String(r?.before ?? ''), after: String(r?.after ?? ''), acknowledged: r?.acknowledged === true }));
  if (!accepted.length) return { ok: false, error: 'No revisions selected.' };

  const { data: row } = await ed.db.from('articles').select('revision, content').eq('id', articleId).maybeSingle();
  if (!row) return { ok: false, error: 'Draft not found.' };
  if (row.revision !== input.baseRevision)
    return { ok: false, error: `The draft changed after this proposal was made (now revision ${row.revision}, proposal was for revision ${input.baseRevision}). Nothing was applied; propose again.` };
  const parsed = SeshatArticleV1.safeParse(row.content);
  if (!parsed.success) return { ok: false, error: 'The draft content is not valid.' };

  const r = applyRevisions(parsed.data, input.section, accepted);
  if (!r.ok) return { ok: false, error: `${r.error} Nothing was applied.` };
  const note = `Editorial Polish (${SECTION_LABELS[input.section]}, style guide ${String(input.styleGuideVersion).slice(0, 20)}): accepted ${accepted.length} of ${Number(input.proposed) || accepted.length} proposed revision(s).`;
  // saveDraft re-checks the revision, the running-job lock and the schema, keeps the data products, and validates.
  const saved = await saveDraft(articleId, input.baseRevision, r.content, note);
  if (!saved.ok) return { ok: false, error: `${saved.error} Nothing was applied.` };
  return { ok: true, revision: saved.revision, status: saved.status, issues: saved.issues, content: saved.content, applied: accepted.length };
}
