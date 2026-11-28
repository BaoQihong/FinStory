// "Fix It for Me" (D-055): targeted, automated correction of the BLOCKING
// publication issues of a working draft, started by the editor from the
// publication dialog. Pure module (no I/O): the server action in
// app/admin/fix-actions.ts loads the draft, calls the model once per attempt
// and saves through saveDraft().
//
// What it may touch:
//  - the text fields named by a blocking validator error whose problem lives in
//    the wording (unknown token, contradicted superlative, level/change and
//    other quantity errors — the same codes as generation repair);
//  - text fields behind an "attention" flag, when every reason on that flag is
//    a validator message (applyAttention copies issue messages into reasons);
//  - the attention flag itself: a validator-derived reason is removed only once
//    the validator no longer reproduces it. Reasons written by the generation
//    model or an editor (thin evidence, provider outage, …) are never cleared.
// What it never touches: data products, charts, citations, evidence labels,
// structure, the headline's facts — and anything not named by an issue.
// Each rewrite is checked deterministically (revisionDelta from Editorial
// Polish): unknown tokens, new typed figures or years, changed quotations or
// source references, or dropping a figure that is not the subject of the
// problem → the rewrite is rejected and the original text kept.
import { SECTION_LABELS, SECTION_ORDER, SeshatArticleV1, type SectionId, type SeshatArticle, type ValidationIssue } from '../studio/schema.ts';
import { validateArticle } from '../studio/validate.ts';
import { checkTokens } from '../studio/numbers.ts';
import { isRepairableCode, repairMaxLength, repairPrompt, type RepairItem, type RepairOut } from '../studio/repair.ts';
import { polishableFields, revisionDelta } from './polish.ts';
import type { Fact } from '../data/display.ts';

export const MAX_FIX_ATTEMPTS = 3;
/** Attention reasons are issue messages truncated to this length (validate.ts applyAttention). */
const REASON_LEN = 380;
const MAX_TARGETS = 30;
const PROTECTED_LEAF = /\.attention\.|\.(chartId|key|icon|evidence|showsEvidence|role|type)$/;

export type FixTarget = {
  path: string;
  section: SectionId;
  problems: string[];
  /** token keys the problems are about: these may be reworded or removed */
  figures: string[];
  /** length told to the model (accepted: up to 10% more, never beyond the schema limit) */
  max: number;
  /** the field's schema limit */
  limit: number;
};
export type ManualIssue = { section?: string; message: string; why: string };
export type FixPlan = {
  targets: FixTarget[];
  /** Attention reasons that are validator messages, per section (removed once no longer reproduced). */
  derived: Partial<Record<SectionId, string[]>>;
  /** What Fix It cannot resolve and why: needs data, structure, a licence decision or human judgement. */
  manual: ManualIssue[];
};

const MANUAL_WHY: Record<string, string> = {
  'unknown-chart': 'The chart reference has no data behind it: remove or replace the chart in its section (structural, not wording).',
  'unknown-indicator': 'The indicator has no data behind it: remove it in Macro (structural, not wording).',
  'dataset-missing': 'A chart plots data that is not among the article’s datasets: a data correction, not wording.',
  'source-missing': 'A figure cites a research source that is missing: needs a source correction.',
  'fact-unbacked': 'A figure could not be recomputed from the stored data: needs a data correction.',
  'fact-mismatch': 'A figure does not match the stored data: needs a data correction.',
  schema: 'The draft is structurally invalid: fix it in the editor.',
};

const getPath = (obj: unknown, path: string): unknown => {
  let cur = obj;
  for (const k of path.replace(/\[(\d+)\]/g, '.$1').split('.')) cur = (cur as Record<string, unknown> | undefined)?.[k];
  return cur;
};
function setPath(obj: unknown, path: string, value: string): boolean {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) {
    cur = cur?.[k] as Record<string, unknown>;
    if (!cur || typeof cur !== 'object') return false;
  }
  const last = keys.at(-1)!;
  if (typeof cur[last] !== 'string') return false;
  cur[last] = value;
  return true;
}
const keysIn = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9]+)(?:\.date)?(?::(?:short|abs))?\}/g)].map((m) => m[1]);
const sectionOf = (path: string): SectionId | null => ((SECTION_ORDER as readonly string[]).includes(path.split(/[.[]/)[0]) ? (path.split(/[.[]/)[0] as SectionId) : null);
const reasonOf = (i: ValidationIssue) => i.message.slice(0, REASON_LEN);

/** The longest text the article schema accepts at `path` (binary search on a copy; at least the current length). */
export function schemaMax(a: SeshatArticle, path: string, ceiling = 4000): number {
  const fits = (n: number) => {
    const c = structuredClone(a);
    return setPath(c, path, 'x'.repeat(n)) && SeshatArticleV1.safeParse(c).success;
  };
  let lo = String(getPath(a, path) ?? '').length;
  if (!fits(lo)) return lo;
  let hi = ceiling;
  if (fits(hi)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Length told to the model: the generation allowance, or 90% of a binding schema limit (models overshoot by a few characters). */
const advertisedMax = (a: SeshatArticle, path: string) => Math.min(repairMaxLength(String(getPath(a, path))), Math.floor(schemaMax(a, path) * 0.9));

/** A readable name for a field ("The Story · Paragraph 3"). */
export function fieldLabel(a: SeshatArticle, path: string): string {
  const s = sectionOf(path);
  if (!s) return path;
  const f = polishableFields(a, s).find((x) => x.path === path);
  return `${SECTION_LABELS[s]} · ${f?.label ?? path.slice(s.length + 1)}`;
}

/**
 * Decide what one Fix It attempt will work on. `knownReasons` are validator messages
 * recorded earlier for this draft (its stored validation and its generated revision):
 * an attention reason found there is validator-derived even if it no longer reproduces.
 */
export function planFix(a: SeshatArticle, opts: { today: string; isTemporary?: boolean; knownReasons?: Iterable<string> }): FixPlan {
  const issues = validateArticle(a, { today: opts.today }).issues;
  const known = new Set([...(opts.knownReasons ?? [])].map((r) => r.slice(0, REASON_LEN)));
  const targets = new Map<string, FixTarget>();
  const manual: ManualIssue[] = [];
  const derived: Partial<Record<SectionId, string[]>> = {};
  if (opts.isTemporary) manual.push({ message: 'Temporary (test) drafts cannot be published.', why: 'This is a property of the draft, not of its content.' });

  const editable = (i: ValidationIssue) => !!i.path && !!sectionOf(i.path) && !PROTECTED_LEAF.test(i.path) && isRepairableCode(i.code) && typeof getPath(a, i.path) === 'string';
  const target = (i: ValidationIssue) => {
    const path = i.path!;
    const t = targets.get(path) ?? { path, section: sectionOf(path)!, problems: [], figures: [], max: advertisedMax(a, path), limit: schemaMax(a, path) };
    if (!t.problems.includes(i.message)) t.problems.push(i.message);
    for (const k of keysIn(i.message)) if (!t.figures.includes(k)) t.figures.push(k);
    targets.set(path, t);
  };
  const manualFor = (i: ValidationIssue) => manual.push({ section: i.section, message: i.message, why: MANUAL_WHY[i.code] ?? 'Not a wording problem in a single text field: correct it in the editor.' });

  for (const i of issues) if (i.level === 'error') {
    if (editable(i)) target(i);
    else manualFor(i);
  }

  for (const s of SECTION_ORDER) {
    const att = a[s].attention;
    if (!att.required) continue;
    if (!att.reasons.length) manual.push({ section: s, message: `${SECTION_LABELS[s]} is flagged as needing editorial attention.`, why: 'Flag set without a reason: review the section and clear the flag in its tab.' });
    const current = issues.filter((i) => i.section === s && i.level !== 'info');
    for (const r of att.reasons) {
      const matching = current.filter((i) => reasonOf(i) === r);
      if (matching.length || known.has(r)) {
        (derived[s] ??= []).push(r);
        for (const i of matching) if (i.level !== 'error') {
          if (editable(i)) target(i);
          else manualFor(i);
        }
      } else manual.push({ section: s, message: r, why: 'Editorial attention note from generation or an editor: needs your judgement. Clear the flag in its tab when resolved.' });
    }
  }
  return { targets: [...targets.values()].slice(0, MAX_TARGETS), derived, manual };
}

export function fixPrompt(a: SeshatArticle, plan: FixPlan, ctx: { observations: string[]; attempt: number; intent?: string; /** why the previous attempt's rewrite of a path was rejected */ feedback?: Record<string, string> }): { user: string; items: RepairItem[] } {
  const items = plan.targets.map((t) => ({ path: t.path, text: String(getPath(a, t.path)), problem: t.problems.join('; ') + (ctx.feedback?.[t.path] ? ` (YOUR PREVIOUS REWRITE WAS REJECTED: ${ctx.feedback[t.path].slice(0, 200)})` : '') + (String(getPath(a, t.path)).length >= t.limit * 0.85 ? ` (LENGTH: this field is close to its limit of ${t.limit} characters — the corrected text must be SHORTER than the current text)` : ''), max: t.max }));
  const extra = [
    'CONTEXT: this draft has been reviewed by a human editor and is being prepared for publication. Make the SMALLEST change that resolves each PROBLEM. Keep the author’s argument, tone and every other sentence of the passage as written. Keep every fact token that the PROBLEM does not name exactly as it is. Do not add figures, years, quotations or source references (S1, F2…). If a claim cannot be supported by the listed facts and observations, qualify it or remove only that claim. If the PROBLEM looks mistaken because the text already uses the figure correctly, rephrase minimally so the figure is unambiguously what its description says.',
    ctx.intent ? `EDITORIAL INTENT (the human author's — preserve it):\n${ctx.intent}` : '',
    ctx.attempt > 1 ? `This is attempt ${ctx.attempt}: an earlier rewrite did not resolve these problems. Address each PROBLEM exactly.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { user: repairPrompt({ items, facts: a.data.facts as Record<string, Fact>, dates: a.data.dates as Record<string, { date: string; method: string }>, observations: ctx.observations, extra }), items };
}

export type FixChange = { path: string; label: string; before: string; after: string; /** substantive changes the editor should look at */ notes: string[] };
export type FixRejected = { path: string; label: string; why: string };
export type ClearedReason = { section: SectionId; reason: string };
export type FixApplied =
  | { ok: true; content: SeshatArticle; changes: FixChange[]; rejected: FixRejected[]; discarded: number; cleared: ClearedReason[] }
  | { ok: false; error: string };

/**
 * Apply the model's fixes to a COPY of the draft: only target paths, each rewrite
 * checked; then remove validator-derived attention reasons the validator no
 * longer reproduces. Never touches anything else; returns an error (and no
 * content) if the result would not be a valid article.
 */
export function applyFix(a: SeshatArticle, plan: FixPlan, out: RepairOut | null, opts: { today: string }): FixApplied {
  const byPath = new Map(plan.targets.map((t) => [t.path, t]));
  const changes: FixChange[] = [];
  const rejected: FixRejected[] = [];
  let discarded = 0;
  const seen = new Set<string>();
  for (const fx of out?.fixes ?? []) {
    const t = byPath.get(fx.path);
    const before = t ? String(getPath(a, t.path)) : '';
    const after = fx.text.trim();
    if (!t || seen.has(fx.path) || after === before.trim()) {
      discarded++;
      continue;
    }
    seen.add(fx.path);
    const label = fieldLabel(a, t.path);
    const reject = (why: string) => rejected.push({ path: t.path, label, why });
    if (after.length > Math.min(Math.round(t.max * 1.1), t.limit)) {
      reject(`The rewrite was too long (${after.length} characters).`);
      continue;
    }
    if (/<\/?[a-z][^>]*>|```|https?:\/\//i.test(after)) {
      reject('The rewrite contained markup or a URL.');
      continue;
    }
    const unknown = checkTokens(after, a.data.facts, a.data.dates);
    if (unknown.length) {
      reject(`The rewrite used an unknown figure (${unknown.map((u) => u.token).join(', ')}).`);
      continue;
    }
    const d = revisionDelta(before, after);
    const lostKeys = [...new Set(d.lostTokens.flatMap(keysIn))];
    const protectedLost = lostKeys.filter((k) => !t.figures.includes(k));
    if (protectedLost.length) {
      reject(`The rewrite dropped verified figures the problem was not about (${protectedLost.map((k) => `{${k}}`).join(', ')}).`);
      continue;
    }
    if (d.bareNew.length || d.newDigits.length) {
      reject(`The rewrite typed new numbers or years (${[...new Set([...d.bareNew, ...d.newDigits])].join(', ')}).`);
      continue;
    }
    if (d.lostQuotes.length || d.newQuotes.length) {
      reject('The rewrite changed quoted text.');
      continue;
    }
    if (d.lostRefs.length || d.newRefs.length) {
      reject('The rewrite changed source references.');
      continue;
    }
    const notes: string[] = [];
    const known = (k: string) => k in a.data.facts || k in a.data.dates;
    const removed = lostKeys.filter((k) => !keysIn(after).includes(k) && known(k));
    const replaced = lostKeys.filter((k) => !known(k));
    if (removed.length) notes.push(`Removed or reworded the claim using ${removed.map((k) => `{${k}}`).join(', ')} — it could not be supported as written.`);
    if (replaced.length) notes.push(`Replaced the unknown reference ${replaced.map((k) => `{${k}}`).join(', ')}.`);
    if (d.lostDigits.length) notes.push(`Removed a year or number (${d.lostDigits.join(', ')}).`);
    if (d.lostCert.length || d.newCert.length) notes.push(`Qualified or changed certainty wording (${[...d.lostCert.map((w) => `−“${w}”`), ...d.newCert.map((w) => `+“${w}”`)].join(', ')}): check the claim still says what you mean.`);
    if (before.length > 120 && after.length < before.length * 0.5) notes.push('Shortened by more than half: check nothing material was dropped.');
    const added = [...new Set(d.newTokens.flatMap(keysIn))];
    if (added.length) notes.push(`Now cites ${added.map((k) => `{${k}}`).join(', ')}.`);
    changes.push({ path: t.path, label, before, after, notes });
  }

  // Apply; a rewrite that breaks the article schema (field limits) is dropped, never saved.
  let next = build(a, changes);
  for (let pass = 0; pass < 3; pass++) {
    const check = SeshatArticleV1.safeParse(next);
    if (check.success) break;
    const bad = new Set(check.error.issues.map((i) => i.path.map((x) => (typeof x === 'number' ? `[${x}]` : `.${String(x)}`)).join('').replace(/^\./, '')));
    const drop = changes.filter((c) => bad.has(c.path));
    if (!drop.length) return { ok: false, error: 'The repaired draft would not be a valid article; nothing was changed.' };
    for (const c of drop) {
      rejected.push({ path: c.path, label: c.label, why: 'The rewrite broke the field’s limits.' });
      changes.splice(changes.indexOf(c), 1);
    }
    next = build(a, changes);
  }
  if (!SeshatArticleV1.safeParse(next).success) return { ok: false, error: 'The repaired draft would not be a valid article; nothing was changed.' };

  // A rewrite must actually help: re-validate and drop any that introduce a new error at their
  // path, or leave as many errors there as before (the reason is fed back to the next attempt).
  const errorsAt = (issues: ValidationIssue[], path: string) => issues.filter((i) => i.level === 'error' && i.path === path).map((i) => i.code);
  const pre = validateArticle(a, { today: opts.today }).issues;
  let after = validateArticle(next, { today: opts.today }).issues;
  const unhelpful = changes.filter((c) => {
    const was = errorsAt(pre, c.path);
    const now = errorsAt(after, c.path);
    const introduced = now.filter((code) => !was.includes(code));
    if (introduced.length) {
      rejected.push({ path: c.path, label: c.label, why: `The rewrite introduced a new problem (${[...new Set(introduced)].join(', ')}): ${after.find((i) => i.path === c.path && introduced.includes(i.code))?.message.slice(0, 160) ?? ''}` });
      return true;
    }
    if (was.length && now.length >= was.length) {
      rejected.push({ path: c.path, label: c.label, why: `The rewrite did not resolve the problem: ${after.find((i) => i.path === c.path && i.level === 'error')?.message.slice(0, 160) ?? ''}` });
      return true;
    }
    return false;
  });
  if (unhelpful.length) {
    for (const c of unhelpful) changes.splice(changes.indexOf(c), 1);
    next = build(a, changes);
    after = validateArticle(next, { today: opts.today }).issues;
  }

  // Attention: drop validator-derived reasons that no longer reproduce; never others.
  const cleared: ClearedReason[] = [];
  for (const s of SECTION_ORDER) {
    const derived = plan.derived[s];
    if (!derived?.length || !next[s].attention.required) continue;
    const live = new Set(after.filter((i) => i.section === s && i.level !== 'info').map(reasonOf));
    const keep = next[s].attention.reasons.filter((r) => !derived.includes(r) || live.has(r));
    for (const r of next[s].attention.reasons) if (!keep.includes(r)) cleared.push({ section: s, reason: r });
    next[s].attention = { required: keep.length > 0, reasons: keep };
  }
  return { ok: true, content: next, changes, rejected, discarded, cleared };
}

function build(a: SeshatArticle, changes: FixChange[]): SeshatArticle {
  const next = structuredClone(a);
  for (const c of changes) setPath(next, c.path, c.after);
  return next;
}

/** Stable identity of a blocking issue, to count what an attempt resolved. */
export const issueKey = (i: { code: string; section?: string; path?: string; message: string }) => (i.code === 'attention' ? `attention|${i.section}` : `${i.code}|${i.path ?? ''}|${i.message}`);
