// Live probe for "Fix It for Me" (D-055) with the configured Arli model.
//
// Copies real drafts into TEMPORARY fixture articles (deleted afterwards),
// then runs the same loop as app/admin/fix-actions.ts — planFix → one Arli
// call → applyFix → revision-checked save — for up to MAX_FIX_ATTEMPTS
// attempts, under the editor's own session (RLS as in production). The
// server-action glue itself (auth, reservation, saveDraft) is exercised
// through the studio UI; this checks the model's behaviour on real content.
//
// Usage: node scripts/studio/fix-live-check.ts <sourceArticleId> [--inject-level-as-change]
// Credentials come from .env.local; nothing secret is printed.
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { arliLlm } from '../../lib/studio/llm.ts';
import { SYSTEM } from '../../lib/studio/pipeline/prompts.ts';
import { RepairOut } from '../../lib/studio/repair.ts';
import { applyFix, fixPrompt, MAX_FIX_ATTEMPTS, planFix } from '../../lib/editorial/fix.ts';
import { checkPublication } from '../../lib/publishing/rules.ts';
import { validateArticle } from '../../lib/studio/validate.ts';
import { SeshatArticleV1, type SeshatArticle } from '../../lib/studio/schema.ts';

const env = readEnv() as Record<string, string>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
{
  const { error } = await db.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
}
const today = new Date().toISOString().slice(0, 10);
const [sourceId, ...flags] = process.argv.slice(2);
if (!sourceId) throw new Error('usage: fix-live-check.ts <sourceArticleId> [--inject-level-as-change]');
const { data: active } = await db.from('generation_jobs').select('id').in('status', ['queued', 'running']).limit(1);
if (active?.length) throw new Error('a generation job is running; the model takes one request at a time');

const { data: src } = await db.from('articles').select('content, brief, working_title').eq('id', sourceId).single();
let content = SeshatArticleV1.parse(src!.content) as SeshatArticle;
if (flags.includes('--inject-level-as-change')) {
  // Turn a correct share statement into a genuine error: "making up {x}" → "jumping {x}"-style change language.
  const s = JSON.stringify(content).replace(/making up \{(src[A-Za-z0-9]+)\}/, 'jumped by {$1}');
  content = SeshatArticleV1.parse(JSON.parse(s));
}
const v0 = validateArticle(content, { today });
content.validation = { checkedAt: new Date().toISOString(), issues: v0.issues, claims: v0.claims };

const { data: art, error: insErr } = await db
  .from('articles')
  .insert({ working_title: `[fix-live-check] ${src!.working_title}`.slice(0, 200), brief: src!.brief, status: 'needs_attention', content, revision: 1, is_temporary: true })
  .select('id')
  .single();
if (insErr || !art) throw new Error(`fixture insert: ${insErr?.message}`);
const id = art.id as string;
await db.from('article_revisions').insert({ article_id: id, revision: 1, origin: 'editor', content, note: 'fix-live-check fixture (deleted after the run)' });
console.log(`fixture ${id.slice(0, 8)} (temporary) from ${sourceId.slice(0, 8)}`);

const known = new Set(content.validation.issues.map((i) => i.message));
const { data: gen } = await db.from('article_revisions').select('content->validation->issues').eq('article_id', sourceId).eq('origin', 'generated').order('revision', { ascending: false }).limit(1);
for (const i of ((gen?.[0] as { issues?: { message?: string }[] } | undefined)?.issues ?? [])) if (i?.message) known.add(i.message);
let observations: string[] = [];
if (content.generation?.jobId) {
  const { data: run } = await db.from('job_stage_runs').select('output->products->observations').eq('job_id', content.generation.jobId).eq('stage', 'fetch').eq('status', 'succeeded').order('id', { ascending: false }).limit(1);
  const obs = (run?.[0] as { observations?: unknown } | undefined)?.observations;
  if (Array.isArray(obs)) observations = obs.filter((o): o is string => typeof o === 'string');
}
console.log(`observations reused: ${observations.length}`);

const llm = arliLlm({ baseUrl: env.ARLI_BASE_URL, apiKey: env.ARLI_API_KEY, model: env.ARLI_MODEL, timeoutMs: 150_000 });
const pub = (a: SeshatArticle) => checkPublication({ content: a, isTemporary: false, generating: false, today }); // temporary-ness ignored for reporting
let revision = 1;
let tokens = 0;
let feedback: Record<string, string> = {};
try {
  const initial = pub(content).blocking;
  console.log(`\nBLOCKING BEFORE (${initial.length}):`);
  for (const b of initial) console.log(`  - [${b.code}] ${b.path ?? b.section ?? ''} ${b.message.slice(0, 160)}`);
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const before = pub(content).blocking;
    const plan = planFix(content, { today, knownReasons: known });
    console.log(`\nATTEMPT ${attempt}: ${plan.targets.length} target field(s); ${plan.manual.length} left to the editor`);
    let out = null;
    if (plan.targets.length) {
      const { user } = fixPrompt(content, plan, { observations, attempt, feedback });
      const r = await llm.complete({ stage: 'fix', system: SYSTEM, user, schema: RepairOut, maxTokens: 4000, temperature: 0.1 });
      tokens += r.usage.promptTokens + r.usage.completionTokens;
      console.log(`  model: ${r.usage.promptTokens} in / ${r.usage.completionTokens} out tokens, ${Math.round(r.ms / 1000)} s, ${r.attempts} call(s)`);
      out = r.data;
    }
    const applied = applyFix(content, plan, out, { today });
    if (!applied.ok) {
      console.log(`  apply failed: ${applied.error}`);
      break;
    }
    for (const c of applied.changes) console.log(`  CHANGED ${c.path}\n    before: ${c.before.slice(0, 260)}\n    after:  ${c.after.slice(0, 260)}${c.notes.length ? `\n    notes:  ${c.notes.join(' | ')}` : ''}`);
    for (const r of applied.rejected) console.log(`  REJECTED ${r.path}: ${r.why}`);
    feedback = Object.fromEntries(applied.rejected.map((r) => [r.path, r.why]));
    for (const c of applied.cleared) console.log(`  CLEARED attention (${c.section}): ${c.reason.slice(0, 120)}`);
    if (!applied.changes.length && !applied.cleared.length) {
      if (applied.rejected.length && attempt < MAX_FIX_ATTEMPTS) {
        console.log('  nothing saved; retrying with the rejection as feedback');
        continue;
      }
      console.log('  no change → stop');
      break;
    }
    const next = applied.content;
    const v = validateArticle(next, { today });
    next.validation = { checkedAt: new Date().toISOString(), issues: v.issues, claims: v.claims };
    const { error: rErr } = await db.from('article_revisions').insert({ article_id: id, revision: revision + 1, origin: 'editor', content: next, note: `Fix It for Me (attempt ${attempt} of ${MAX_FIX_ATTEMPTS}) — live check` });
    if (rErr) throw new Error(`revision insert: ${rErr.message}`);
    const { data: upd, error: uErr } = await db.from('articles').update({ content: next, revision: revision + 1 }).eq('id', id).eq('revision', revision).select('revision');
    if (uErr || !upd?.length) throw new Error(`stale or failed update: ${uErr?.message ?? 'revision moved'}`);
    revision++;
    content = next;
    const after = pub(content).blocking;
    console.log(`  saved revision ${revision}; blocking ${before.length} → ${after.length}`);
    if (!after.length) break;
    const nextPlan = planFix(content, { today, knownReasons: known });
    if (!nextPlan.targets.length || (after.length >= before.length && !applied.rejected.length)) {
      console.log('  stop: nothing repairable left or no progress');
      break;
    }
  }
  const final = pub(content);
  console.log(`\nBLOCKING AFTER (${final.blocking.length}):`);
  for (const b of final.blocking) console.log(`  - [${b.code}] ${b.path ?? b.section ?? ''} ${b.message.slice(0, 160)}`);
  console.log(`WARNINGS AFTER: ${final.warnings.map((w) => w.code).join(', ') || 'none'}`);
  const { data: revs } = await db.from('article_revisions').select('revision').eq('article_id', id).order('revision');
  console.log(`revisions kept: ${(revs ?? []).map((r) => r.revision).join(', ')}; model tokens total: ${tokens}`);
  // The source draft is never touched.
  const { data: srcAfter } = await db.from('articles').select('content').eq('id', sourceId).single();
  console.log(`source draft unchanged: ${JSON.stringify(srcAfter!.content) === JSON.stringify(src!.content)}`);
} finally {
  await admin.from('article_revisions').delete().eq('article_id', id);
  const { error } = await admin.from('articles').delete().eq('id', id);
  console.log(error ? `CLEANUP FAILED for ${id}: ${error.message}` : `fixture ${id.slice(0, 8)} deleted`);
}
