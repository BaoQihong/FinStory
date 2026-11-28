// Editorial Polish (Phase 3B.2): an optional, human-reviewed revision pass over
// the reader-facing PROSE of one section of a working draft.
//
// Safety model: the model never sees or returns the article object. It gets
// a whitelist of prose fields (path + text) and may return replacement text
// for those paths only. Everything else (headline, titles, chart references
// and takeaways, data, citations, evidence labels, implications, scenario
// conditions / assets / watch-lists / uncertainties, disclaimer, methodology)
// is structurally unreachable. Every proposed text is then checked
// deterministically (checkRevision) for changed figures, tokens, dates,
// quotations, source references and certainty wording, and nothing is
// applied until an editor accepts it against the exact revision it was
// proposed for. Pure module: no I/O, no server-only imports.
import { z } from 'zod';
import type { SeshatArticle, SectionId, StoryBrief } from '../studio/schema.ts';
import { SECTION_LABELS } from '../studio/schema.ts';
import { checkTokens, findBareNumbers, findCliches, findFormulaicContrasts, stringLeaves } from '../studio/numbers.ts';
import { stockPhrasesIn } from './signals.ts';
import { REVISION_PRINCIPLES, STYLE_GUIDE, STYLE_GUIDE_VERSION } from './style-guide.ts';

export type PolishField = { path: string; label: string; text: string; max: number };

/** The reader-facing prose fields Editorial Polish may revise, per section. Anything not listed is protected. */
export function polishableFields(a: SeshatArticle, section: SectionId): PolishField[] {
  const out: PolishField[] = [];
  const add = (path: string, label: string, text: string, max: number) => out.push({ path, label, text, max });
  if (section === 'story') {
    add('story.dek', 'Dek', a.story.dek, 400);
    a.story.keyPoints.forEach((k, i) => add(`story.keyPoints[${i}]`, `Key point ${i + 1}`, k, 400));
    let para = 0;
    a.story.blocks.forEach((b, i) => {
      if (b.type === 'p') add(`story.blocks[${i}].text`, `Paragraph ${++para}`, b.text, 1600);
      else if (b.type === 'h3') add(`story.blocks[${i}].text`, 'Subhead', b.text, 160);
      else if (b.type === 'pullquote') add(`story.blocks[${i}].text`, 'Pull quote', b.text, 300);
    });
  } else if (section === 'macro') {
    add('macro.intro', 'Introduction', a.macro.intro, 800);
    a.macro.indicators.forEach((x, i) => add(`macro.indicators[${i}].note`, `Indicator note (${x.key})`, x.note, 300));
    a.macro.explainers.forEach((x, i) => add(`macro.explainers[${i}].text`, `“${x.title}”`, x.text, 800));
  } else if (section === 'analytics') {
    add('analytics.intro', 'Introduction', a.analytics.intro, 800);
    a.analytics.chain.steps.forEach((x, i) => add(`analytics.chain.steps[${i}].text`, `Mechanism step ${i + 1}: ${x.title}`, x.text, 600));
    a.analytics.comparisons.forEach((x, i) => add(`analytics.comparisons[${i}].text`, `“${x.title}”`, x.text, 800));
    add('analytics.implications.intro', 'Implications introduction', a.analytics.implications.intro, 500);
  } else {
    add('outlook.intro', 'Introduction', a.outlook.intro, 800);
    a.outlook.scenarios.forEach((x, i) => {
      add(`outlook.scenarios[${i}].summary`, `Scenario “${x.name}”: summary`, x.summary, 500);
      add(`outlook.scenarios[${i}].whyItMatters`, `Scenario “${x.name}”: why it matters`, x.whyItMatters, 600);
    });
  }
  return out.filter((f) => f.text.trim().length > 0);
}

// ── Model I/O ───────────────────────────────────────────────────────────────
export const PolishOut = z.object({
  revisions: z.array(z.object({ path: z.string().max(80), text: z.string().max(2000) })).max(40),
  concerns: z.array(z.object({ path: z.string().max(80), concern: z.string().max(400) })).max(12),
});
export type PolishOut = z.infer<typeof PolishOut>;

const TOKEN_RE = /\{([a-zA-Z0-9]+)(?:\.(date))?(?::(short|abs))?\}/g;

/** All prose of the article (read-only context) so a revision fits the whole piece. */
function articleContext(a: SeshatArticle): string {
  const lines: string[] = [`HEADLINE: ${a.story.headline}`, `DEK: ${a.story.dek}`];
  for (const sec of ['story', 'macro', 'analytics', 'outlook'] as const) {
    lines.push(`\n== ${SECTION_LABELS[sec].toUpperCase()} ==`);
    for (const [path, text] of stringLeaves(a[sec], sec)) {
      if (/\.(attention|chartId|key|icon|evidence|showsEvidence|role|type|kicker|headline|dek)\b|\.attention\./.test(path)) continue;
      lines.push(`[${path}] ${text}`);
    }
  }
  return lines.join('\n');
}

function tokenGlossary(a: SeshatArticle, texts: string[]): string {
  const used = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(TOKEN_RE)) used.add(m[1]);
  return [...used]
    .map((k) => {
      const f = a.data.facts[k] as { method?: string } | undefined;
      const d = a.data.dates[k] as { method?: string } | undefined;
      return `{${k}}: ${(f?.method ?? d?.method ?? 'unknown').replace(/\s+/g, ' ').slice(0, 120)}`;
    })
    .join('\n');
}

/** Deterministic hints for the line editor: the style-guide habits detected in one field. */
function habitNote(text: string): string {
  const habits = [
    ...findFormulaicContrasts(text).map((h) => `formulaic contrast "${h}"`),
    ...findCliches(text).map((h) => `cliché "${h}"`),
    ...stockPhrasesIn(text).map((h) => `stock phrase "${h}"`),
  ];
  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes > 1) habits.push(`${dashes} em dashes`);
  return habits.length ? ` [habits found: ${habits.join('; ')}]` : '';
}

export function polishPrompt(a: SeshatArticle, section: SectionId, brief: StoryBrief | null): { user: string; fields: PolishField[] } {
  const fields = polishableFields(a, section);
  const intent = brief
    ? [brief.argument && `Author's argument: ${brief.argument}`, brief.angle && `Editorial angle: ${brief.angle}`, brief.audience && `Audience: ${brief.audience}`, brief.voice && `Tone and voice notes: ${brief.voice}`].filter(Boolean).join('\n')
    : '';
  const user = `You are Seshat's line editor. Revise the prose of ONE section (${SECTION_LABELS[section]}) of a draft so it reads like thoughtful financial journalism by a human editor, following the style guide below.

${STYLE_GUIDE}

${intent ? `EDITORIAL INTENT (the human author's — preserve it):\n${intent}\n` : ''}
THE WHOLE ARTICLE (read-only context, so your revision fits what comes before and after; do not revise other sections):
${articleContext(a)}

WHAT THE FACT TOKENS MEAN (tokens are filled in with numbers when published):
${tokenGlossary(a, fields.map((f) => f.text)) || '(none)'}

FIELDS YOU MAY REVISE (each line: [path] (max N chars) text; "habits found" lists what Seshat's checker detected in that field):
${fields.map((f) => `[${f.path}] (max ${f.max} chars) ${f.text}${habitNote(f.text)}`).join('\n')}

Your job:
- This is a LINE EDIT, not proofreading. In every field, remove the habits the style guide lists wherever they occur. Resolve every "habits found" note, and look for the habits the checker cannot see: scene-setting openings, abstract nouns standing in for a concrete point, sentences that restate a point already made in this or another section, stock transitions, endings that summarise or advise. Rewrite whole sentences where needed (rework, don't swap in a synonym), vary the rhythm, and make each paragraph follow from the last. Cut what adds nothing. Keep the argument and every fact.
- ${REVISION_PRINCIPLES}
- Hard rules: keep every fact token exactly as written ({key}, {key.date}, {key:abs}) — the same tokens, each still attached to the claim it supports; type no digits for figures; keep years and dates as they are; keep any text in quotation marks verbatim; keep source references (S1, F2…) unchanged; keep hedges and conditions where they carry meaning (may / could / if…) and never turn a possibility into a certainty or a scenario into a prediction.
- Each field stays a separate field: do not move content between paths, do not merge or split fields, stay within each field's max length.
- If you notice a factual inconsistency, an unsupported claim, or a conclusion the text does not justify, DO NOT fix it by inventing support or silently changing the claim — report it in "concerns" with its path.
Return {"revisions": [{"path": "...", "text": "..."}], "concerns": [{"path": "...", "concern": "..."}]}. Include only fields you actually changed; leave a field out only if it has none of the habits and already reads naturally.`;
  return { user, fields };
}

// ── Deterministic checks ────────────────────────────────────────────────────
export type CheckReason = { severity: 'block' | 'material' | 'check'; message: string };
export type RevisionCheck = { status: 'ok' | 'flagged' | 'rejected'; reasons: CheckReason[] };

const multiset = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const diff = (a: string[], b: string[]) => {
  const mb = multiset(b);
  const missing: string[] = [];
  for (const x of a) {
    const n = mb.get(x) ?? 0;
    if (n > 0) mb.set(x, n - 1);
    else missing.push(x);
  }
  return missing;
};
const tokensOf = (s: string) => [...s.matchAll(TOKEN_RE)].map((m) => m[0]);
const digitsOf = (s: string) => [...s.replace(TOKEN_RE, ' ').matchAll(/\d[\d,.]*\d|\d/g)].map((m) => m[0].replace(/[.,]$/, ''));
const quotesOf = (s: string) => [...s.matchAll(/[“"]([^”"]{4,})[”"]/g)].map((m) => m[1].trim());
const refsOf = (s: string) => [...s.matchAll(/\b[SF]\d{1,2}\b/g)].map((m) => m[0]);
const CERTAINTY = /\b(not|no|never|none|cannot|can't|won't|doesn't|don't|isn't|aren't|wasn't|weren't|may|might|could|would|will|likely|unlikely|probably|possibly|perhaps|must|should|if|unless|only)\b/gi;
const NEGATIONS = new Set(['not', 'no', "isn't", "aren't", "wasn't", "weren't", "doesn't", "don't"]);
const certaintyOf = (s: string) => [...s.matchAll(CERTAINTY)].map((m) => m[0].toLowerCase());

/**
 * Compare a proposed revision with the current text of the same field.
 * - rejected: cannot be accepted (unknown token, too long, empty, markup/URL).
 * - flagged: may be accepted, but only after the editor checks the listed
 *   material changes (figures, tokens, dates, quotations, references) or
 *   wording that changes certainty/negation.
 */
/** Structured difference between two versions of one field (shared by Polish and Fix It for Me). */
export type RevisionDelta = {
  lostTokens: string[];
  newTokens: string[];
  bareNew: string[];
  lostDigits: string[];
  newDigits: string[];
  lostQuotes: string[];
  newQuotes: string[];
  lostRefs: string[];
  newRefs: string[];
  lostCert: string[];
  newCert: string[];
};

export function revisionDelta(before: string, after: string): RevisionDelta {
  const t = after.trim();
  let lostCert = diff(certaintyOf(before), certaintyOf(t));
  let newCert = diff(certaintyOf(t), certaintyOf(before));
  // Dissolving a formulaic "not X; it is Y" contrast necessarily drops a negation: expected, not a change of claim.
  // Modal/hedge changes (may → will) and any other negation change are still flagged.
  const removedContrasts = findFormulaicContrasts(before).length - findFormulaicContrasts(t).length;
  if (removedContrasts > 0) {
    let budget = removedContrasts;
    lostCert = lostCert.filter((w) => !(budget > 0 && NEGATIONS.has(w) && budget--));
    budget = removedContrasts;
    newCert = newCert.filter((w) => !(budget > 0 && NEGATIONS.has(w) && budget--));
  }
  return {
    lostTokens: diff(tokensOf(before), tokensOf(t)),
    newTokens: diff(tokensOf(t), tokensOf(before)),
    bareNew: findBareNumbers(t).filter((b) => !findBareNumbers(before).some((o) => o.match === b.match)).map((b) => b.match),
    lostDigits: diff(digitsOf(before), digitsOf(t)),
    newDigits: diff(digitsOf(t), digitsOf(before)),
    lostQuotes: quotesOf(before).filter((q) => !t.includes(q)),
    newQuotes: quotesOf(t).filter((q) => !before.includes(q)),
    lostRefs: diff(refsOf(before), refsOf(t)),
    newRefs: diff(refsOf(t), refsOf(before)),
    lostCert,
    newCert,
  };
}

export function checkRevision(before: string, after: string, ctx: { max: number; facts: Record<string, unknown>; dates: Record<string, unknown> }): RevisionCheck {
  const reasons: CheckReason[] = [];
  const t = after.trim();
  if (!t) reasons.push({ severity: 'block', message: 'The proposed text is empty.' });
  if (t.length > ctx.max) reasons.push({ severity: 'block', message: `The proposed text is ${t.length} characters; this field allows ${ctx.max}.` });
  if (/<\/?[a-z][^>]*>|```|https?:\/\//i.test(t)) reasons.push({ severity: 'block', message: 'The proposed text contains markup or a URL.' });
  for (const p of checkTokens(t, ctx.facts, ctx.dates)) reasons.push({ severity: 'block', message: `Unknown fact token ${p.token} (${p.reason}).` });

  const { lostTokens, newTokens, bareNew, lostDigits, newDigits, lostQuotes, newQuotes, lostRefs, newRefs, lostCert, newCert } = revisionDelta(before, t);
  if (lostTokens.length) reasons.push({ severity: 'material', message: `Figures removed: ${[...new Set(lostTokens)].join(', ')}.` });
  if (newTokens.length) reasons.push({ severity: 'material', message: `Figures added: ${[...new Set(newTokens)].join(', ')}.` });
  if (bareNew.length) reasons.push({ severity: 'material', message: `New figure typed into the text (not a fact token): ${bareNew.map((b) => `“${b}”`).join(', ')}.` });
  if (lostDigits.length || newDigits.length)
    reasons.push({ severity: 'material', message: `Numbers or dates changed${lostDigits.length ? ` (removed ${lostDigits.join(', ')})` : ''}${newDigits.length ? ` (added ${newDigits.join(', ')})` : ''}.` });
  if (lostQuotes.length) reasons.push({ severity: 'material', message: `Quoted text changed or removed: ${lostQuotes.map((q) => `“${q.slice(0, 60)}”`).join(', ')}.` });
  if (newQuotes.length) reasons.push({ severity: 'material', message: `New quotation added: ${newQuotes.map((q) => `“${q.slice(0, 60)}”`).join(', ')} — check it is not presented as someone's words.` });
  if (lostRefs.length || newRefs.length) reasons.push({ severity: 'material', message: `Source references changed (${[...lostRefs.map((r) => `−${r}`), ...newRefs.map((r) => `+${r}`)].join(', ')}).` });

  if (lostCert.length || newCert.length)
    reasons.push({ severity: 'check', message: `Certainty or negation wording changed (${[...new Set(lostCert)].map((w) => `−“${w}”`).concat([...new Set(newCert)].map((w) => `+“${w}”`)).join(', ')}): check the claim still says the same thing.` });
  if (before.length > 120 && t.length < before.length * 0.5) reasons.push({ severity: 'check', message: 'Shortened by more than half: check nothing material was dropped.' });

  const status = reasons.some((r) => r.severity === 'block') ? 'rejected' : reasons.length ? 'flagged' : 'ok';
  return { status, reasons };
}

// ── Proposal assembly and application ──────────────────────────────────────
export type PolishItem = { path: string; label: string; before: string; after: string; check: RevisionCheck };
export type PolishProposal = {
  section: SectionId;
  baseRevision: number;
  styleGuideVersion: string;
  items: PolishItem[];
  concerns: { path: string; label: string; concern: string }[];
  /** Model output that could not be used (unknown path, duplicate, unchanged). */
  discarded: number;
};

export function buildProposal(a: SeshatArticle, section: SectionId, baseRevision: number, out: PolishOut): PolishProposal {
  const fields = new Map(polishableFields(a, section).map((f) => [f.path, f]));
  const seen = new Set<string>();
  const items: PolishItem[] = [];
  let discarded = 0;
  for (const r of out.revisions) {
    const f = fields.get(r.path);
    const after = r.text.trim();
    if (!f || seen.has(r.path) || after === f.text.trim()) {
      discarded++;
      continue;
    }
    seen.add(r.path);
    items.push({ path: f.path, label: f.label, before: f.text, after, check: checkRevision(f.text, after, { max: f.max, facts: a.data.facts, dates: a.data.dates }) });
  }
  const order = [...fields.keys()];
  items.sort((x, y) => order.indexOf(x.path) - order.indexOf(y.path));
  const concerns = out.concerns
    .filter((c) => c.concern.trim())
    .map((c) => ({ path: c.path, label: fields.get(c.path)?.label ?? c.path, concern: c.concern.trim() }));
  return { section, baseRevision, styleGuideVersion: STYLE_GUIDE_VERSION, items, concerns, discarded };
}

/** `acknowledged` must be true for a revision the checks flagged: the editor saw the warning and accepted anyway. */
export type AcceptedRevision = { path: string; before: string; after: string; acknowledged?: boolean };

/**
 * Apply accepted revisions to a COPY of the current draft. Refuses (returns
 * an error) if any path is not polishable in that section, if the field no
 * longer holds the text the proposal was based on (stale), or if the
 * revision fails the blocking checks. Never touches anything else.
 */
export function applyRevisions(a: SeshatArticle, section: SectionId, accepted: AcceptedRevision[]): { ok: true; content: SeshatArticle } | { ok: false; error: string } {
  const fields = new Map(polishableFields(a, section).map((f) => [f.path, f]));
  const next = structuredClone(a);
  const seen = new Set<string>();
  for (const r of accepted) {
    const f = fields.get(r.path);
    if (!f) return { ok: false, error: `“${r.path}” is not an editable prose field of ${SECTION_LABELS[section]}.` };
    if (seen.has(r.path)) return { ok: false, error: `“${f.label}” was submitted twice.` };
    seen.add(r.path);
    if (f.text !== r.before) return { ok: false, error: `“${f.label}” has changed since the revision was proposed. Propose again to revise the current text.` };
    const check = checkRevision(f.text, r.after, { max: f.max, facts: a.data.facts, dates: a.data.dates });
    if (check.status === 'rejected') return { ok: false, error: `“${f.label}” cannot be accepted: ${check.reasons.filter((x) => x.severity === 'block').map((x) => x.message).join(' ')}` };
    if (check.status === 'flagged' && !r.acknowledged) return { ok: false, error: `“${f.label}” changes more than wording (${check.reasons.map((x) => x.message).join(' ')}) and needs explicit confirmation.` };
    if (!setPath(next, r.path, r.after.trim())) return { ok: false, error: `Could not apply “${f.label}”.` };
  }
  return { ok: true, content: next };
}

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
