// Unit tests for "Fix It for Me" (D-055): what a repair may target, the
// deterministic guards on each rewrite, attention-flag handling, and the
// guarantee that nothing outside the targeted fields changes.
// The article below is a TEST FIXTURE ONLY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFix, fixPrompt, issueKey, MAX_FIX_ATTEMPTS, planFix, schemaMax } from '../../lib/editorial/fix.ts';
import { repairPrompt, RepairOut } from '../../lib/studio/repair.ts';
import { REVISION_PRINCIPLES } from '../../lib/editorial/style-guide.ts';
import { checkPublication } from '../../lib/publishing/rules.ts';
import { validateArticle } from '../../lib/studio/validate.ts';
import { SeshatArticleV1, type SeshatArticle } from '../../lib/studio/schema.ts';

const TODAY = '2026-11-28';
const ok = { required: false, reasons: [] as string[] };
const quantity = (kind: 'level' | 'change') => ({ kind, unit: '%', measure: 'ratio', temporal: 'historical', ...(kind === 'change' ? { window: '1y' } : {}) });
const facts = {
  cpiYoy: { value: 3.1, format: 'pct', decimals: 1, seriesIds: ['CPI'], method: 'Year-over-year change in consumer prices', date: '2026-10-01', datePrecision: 'month', quantity: quantity('change') },
  aiShare: { value: 26, format: 'text', text: 'about 26%', decimals: 0, seriesIds: [], method: 'Quoted from S1: share of the index held by six AI-related companies', date: '2026-11-03', sourceRefs: ['S1'], quantity: quantity('level') },
};

function fixture(): SeshatArticle {
  const r = SeshatArticleV1.safeParse({
    schemaVersion: 1,
    meta: { workingTitle: 'Fix fixture', section: 'markets', author: { name: 'Seshat Editorial', role: 'Editor' }, asOf: '2026-11-01', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-21T00:00:00Z' },
    story: {
      kicker: 'Markets',
      headline: 'PROTECTED-HEADLINE',
      dek: 'A handful of companies now carry the index.',
      keyPoints: ['Prices rose {cpiYoy} over the year.'],
      blocks: [
        // level-as-change error on {aiShare}; {cpiYoy} is used correctly and must survive.
        { type: 'p', text: 'Six AI-related companies jumped {aiShare} this year, while consumer prices rose {cpiYoy}.' },
        { type: 'chart', chartId: 'missing', question: 'PROTECTED-Q', takeaway: 'PROTECTED-T' },
        { type: 'p', text: 'The central bank said it was “not yet confident”, according to S1.' },
        { type: 'p', text: 'PROTECTED-PARAGRAPH: an untouched human edit.' },
      ],
      attention: ok,
    },
    macro: {
      title: 'Macro',
      intro: 'Inflation of 3% is the backdrop.',
      indicators: [],
      charts: [],
      explainers: [{ title: 'Context', text: 'PROTECTED-EXPLAINER', evidence: 'context' }],
      attention: ok,
    },
    analytics: {
      title: 'Analytics',
      intro: 'PROTECTED-ANALYTICS-INTRO',
      chain: { title: 'Chain', steps: [{ title: 'A', text: 'Step A.', evidence: 'interpretation' }, { title: 'B', text: 'Step B.', evidence: 'interpretation' }] },
      charts: [],
      comparisons: [],
      implications: { title: 'Implications', intro: 'For holders.', items: [{ asset: 'Index funds', icon: 'stocks', shows: 'PROTECTED-SHOWS', showsEvidence: 'context', couldMean: 'PROTECTED-COULDMEAN' }] },
      attention: ok,
    },
    outlook: {
      title: 'Outlook',
      intro: 'What next.',
      disclaimer: 'PROTECTED-DISCLAIMER',
      scenarios: [
        { key: 's1', name: 'Broadening', role: 'central', summary: 'Gains spread to more stocks.', conditions: ['C'], whyItMatters: 'W.', assets: [{ asset: 'Bonds', effect: 'E' }], watch: ['The {nope} reading'], uncertainties: ['U'] },
        { key: 's2', name: 'Narrowing', role: 'alternative', summary: 'Gains stay concentrated.', conditions: ['C'], whyItMatters: 'W.', assets: [{ asset: 'Bonds', effect: 'E' }], watch: ['W'], uncertainties: ['U'] },
      ],
      attention: ok,
    },
    methodology: ['PROTECTED-METHOD'],
    evidence: { citations: [{ ref: 'S1', title: 'Index weights', url: 'https://example.org/a', publisher: 'Example', sourceType: 'journalism', publishedAt: '2026-11-06' }], findings: [] },
    data: { facts, dates: {}, charts: {}, indicators: [], sources: [] },
    validation: { checkedAt: '2026-11-21T00:00:00Z', issues: [], claims: [] },
    generation: { jobId: 'j', model: 'm', searchProvider: 's', dataProviders: [], generatedAt: '2026-11-20T00:00:00Z' },
  });
  if (!r.success) throw new Error(JSON.stringify(r.error.issues));
  return r.data;
}

/** Mark Macro for attention the way generation does (validator message) plus a model-written reason. */
function withAttention(a: SeshatArticle) {
  const bare = validateArticle(a, { today: TODAY }).issues.find((i) => i.section === 'macro' && i.code === 'bare-number')!;
  a.macro.attention = { required: true, reasons: [bare.message.slice(0, 380), 'Evidence on household inflation expectations is thin.'] };
  a.outlook.attention = { required: true, reasons: ['{nope}: unknown fact key'] };
  return a;
}

test('plan: wording errors and validator-derived attention reasons are targeted; data/structure and editorial notes are left to the editor', () => {
  const a = withAttention(fixture());
  const plan = planFix(a, { today: TODAY });
  const paths = plan.targets.map((t) => t.path).sort();
  assert.deepEqual(paths, ['macro.intro', 'outlook.scenarios[0].watch[0]', 'story.blocks[0].text']);
  assert.deepEqual(plan.targets.find((t) => t.path === 'story.blocks[0].text')!.figures, ['aiShare']);
  const manual = plan.manual.map((m) => m.message).join(' | ');
  assert.match(manual, /Chart "missing" has no data/);
  assert.match(manual, /household inflation expectations is thin/);
  assert.equal(plan.derived.macro?.length, 1);
  assert.equal(plan.derived.outlook?.length, 1);
  assert.ok(!paths.some((p) => /headline|chartId|methodology|data\./.test(p)));
  // The model is told a length under the field's real schema limit (watch items: 200 characters).
  assert.equal(schemaMax(a, 'outlook.scenarios[0].watch[0]'), 200);
  for (const t of plan.targets) assert.ok(t.max <= t.limit && t.limit === schemaMax(a, t.path), t.path);
});

test('a good repair changes only the targeted fields and resolves their errors', () => {
  const a = withAttention(fixture());
  const plan = planFix(a, { today: TODAY });
  const r = applyFix(a, plan, {
    fixes: [
      { path: 'story.blocks[0].text', text: 'Six AI-related companies make up {aiShare} of the index, while consumer prices rose {cpiYoy}.' },
      { path: 'macro.intro', text: 'Inflation of {cpiYoy} is the backdrop.' },
      { path: 'outlook.scenarios[0].watch[0]', text: 'The next inflation reading, {cpiYoy}' },
    ],
  }, { today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.changes.length, 3);
  assert.equal(r.rejected.length, 0);
  // Everything else is byte-for-byte the same.
  const strip = (x: SeshatArticle) => {
    const c = structuredClone(x) as SeshatArticle;
    c.story.blocks[0] = { type: 'p', text: '' };
    c.macro.intro = '';
    c.outlook.scenarios[0].watch[0] = '';
    for (const s of ['macro', 'outlook'] as const) c[s].attention = ok;
    return c;
  };
  assert.deepEqual(strip(r.content), strip(a));
  assert.deepEqual(r.content.data, a.data);
  const errors = validateArticle(r.content, { today: TODAY }).issues.filter((i) => i.level === 'error').map((i) => i.code);
  assert.deepEqual(errors, ['unknown-chart']); // structural issue stays for the editor
  // Attention: the validator-derived reasons are cleared; the model's editorial note stays, so Macro stays flagged.
  assert.deepEqual(r.content.macro.attention, { required: true, reasons: ['Evidence on household inflation expectations is thin.'] });
  assert.deepEqual(r.content.outlook.attention, { required: false, reasons: [] });
  assert.equal(r.cleared.length, 2);
  // The input is never mutated.
  assert.equal(a.macro.intro, 'Inflation of 3% is the backdrop.');
});

test('unsafe rewrites are rejected and the original text kept', () => {
  const a = fixture();
  const plan = planFix(a, { today: TODAY });
  const r = applyFix(a, plan, {
    fixes: [
      { path: 'story.blocks[0].text', text: 'Six AI-related companies make up {aiShare} of the index.' }, // drops {cpiYoy}, which the problem is not about
      { path: 'outlook.scenarios[0].watch[0]', text: 'The {alsoNope} reading' }, // unknown token
      { path: 'story.blocks[3].text', text: 'Rewritten human edit.' }, // not a target
      { path: 'macro.intro', text: 'Inflation of {cpiYoy} is the backdrop.' }, // not a target (no attention flag): discarded
    ],
  }, { today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.changes.length, 0);
  assert.equal(r.discarded, 2);
  assert.match(r.rejected.find((x) => x.path === 'story.blocks[0].text')!.why, /dropped verified figures.*cpiYoy/);
  assert.match(r.rejected.find((x) => x.path === 'outlook.scenarios[0].watch[0]')!.why, /unknown figure/);
  assert.deepEqual(r.content, a);

  const typed = applyFix(a, plan, { fixes: [{ path: 'story.blocks[0].text', text: 'Six AI-related companies make up 26% of the index in 2025, while consumer prices rose {cpiYoy}.' }] }, { today: TODAY });
  assert.ok(typed.ok);
  assert.equal(typed.changes.length, 0);
  assert.match(typed.rejected[0].why, /new numbers or years/);

  const long = applyFix(a, plan, { fixes: [{ path: 'outlook.scenarios[0].watch[0]', text: 'x'.repeat(400) }] }, { today: TODAY });
  assert.ok(long.ok);
  assert.match(long.rejected[0].why, /too long/);
});

test('a rewrite that leaves its error, or introduces a new one, is rejected (and the reason can be fed back)', () => {
  const a = fixture();
  const plan = planFix(a, { today: TODAY });
  const r = applyFix(a, plan, {
    fixes: [
      { path: 'story.blocks[0].text', text: 'Six AI-related companies surged by {aiShare} this year, while consumer prices rose {cpiYoy}.' }, // still level-as-change
      { path: 'outlook.scenarios[0].watch[0]', text: 'Whether AI stocks jumped {aiShare}' }, // unknown token fixed, but a new level-as-change error
    ],
  }, { today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.changes.length, 0);
  assert.match(r.rejected.find((x) => x.path === 'story.blocks[0].text')!.why, /did not resolve the problem/);
  assert.match(r.rejected.find((x) => x.path === 'outlook.scenarios[0].watch[0]')!.why, /introduced a new problem \(quantity:level-as-change\)/);
  assert.deepEqual(r.content, a);
});

test('removing an unsupported claim is allowed for the figure in question and reported', () => {
  const a = fixture();
  const plan = planFix(a, { today: TODAY });
  const r = applyFix(a, plan, { fixes: [{ path: 'story.blocks[0].text', text: 'A few AI-related companies carry much of the index, while consumer prices rose {cpiYoy}.' }] }, { today: TODAY });
  assert.ok(r.ok);
  assert.equal(r.changes.length, 1);
  assert.match(r.changes[0].notes.join(' '), /Removed or reworded the claim using \{aiShare\}/);
});

test('attention reasons the validator raised earlier but no longer reproduces are cleared without the model', () => {
  const a = fixture();
  a.story.attention = { required: true, reasons: ['"highest" is not backed by a high/low or "since" fact in the same sentence'] };
  const plan = planFix(a, { today: TODAY, knownReasons: ['"highest" is not backed by a high/low or "since" fact in the same sentence'] });
  assert.deepEqual(plan.derived.story, ['"highest" is not backed by a high/low or "since" fact in the same sentence']);
  const r = applyFix(a, plan, null, { today: TODAY });
  assert.ok(r.ok);
  assert.deepEqual(r.content.story.attention, { required: false, reasons: [] });
  // Without that history the same reason is treated as an editorial note and kept.
  const unknown = planFix(a, { today: TODAY });
  assert.equal(unknown.derived.story, undefined);
  assert.ok(unknown.manual.some((m) => m.section === 'story'));
});

test('licensing warnings and editorial warnings are not targets and stay visible', () => {
  const a = fixture();
  (a.data.sources as unknown[]).push({ key: 'SPY', seriesId: 'SPY', provider: 'Tiingo', short: 'Tiingo', url: 'https://api.tiingo.com' });
  const before = checkPublication({ content: a, isTemporary: false, generating: false, today: TODAY });
  assert.ok(before.warnings.some((w) => w.code === 'tiingo-licence'));
  const plan = planFix(a, { today: TODAY });
  assert.ok(!plan.targets.some((t) => t.problems.some((p) => /Tiingo/.test(p))));
  const r = applyFix(a, plan, { fixes: [{ path: 'story.blocks[0].text', text: 'Six AI-related companies make up {aiShare} of the index, while consumer prices rose {cpiYoy}.' }] }, { today: TODAY });
  assert.ok(r.ok);
  const after = checkPublication({ content: r.content, isTemporary: false, generating: false, today: TODAY });
  assert.ok(after.warnings.some((w) => w.code === 'tiingo-licence'));
  assert.ok(after.blocking.length < before.blocking.length);
});

test('temporary drafts are reported, not "fixed"; malformed model output is rejected by the schema', () => {
  const plan = planFix(fixture(), { today: TODAY, isTemporary: true });
  assert.ok(plan.manual.some((m) => /Temporary/.test(m.message)));
  assert.equal(RepairOut.safeParse({ fixes: [{ path: 'story.dek', text: '' }] }).success, false);
  assert.equal(RepairOut.safeParse({ fixes: 'nope' }).success, false);
  assert.equal(RepairOut.safeParse({}).success, false);
});

test('shared repair prompt: generation stage text is unchanged; Fix It adds its constraints and retries say so', () => {
  const base = repairPrompt({ items: [{ path: 'p', text: 't', problem: 'x' }], facts: {}, dates: {}, observations: [] });
  assert.ok(base.endsWith(`Keep everything else the same. ${REVISION_PRINCIPLES} Return {"fixes": [{"path": "...", "text": "..."}]}.`));
  const a = fixture();
  const { user, items } = fixPrompt(a, planFix(a, { today: TODAY }), { observations: ['obs line'], attempt: 2, intent: "Author's argument: concentration is a risk" });
  assert.ok(items.every((i) => !/PROTECTED/.test(i.text)));
  assert.match(user, /SMALLEST change/);
  assert.match(user, /attempt 2/);
  assert.match(user, /concentration is a risk/);
  assert.match(user, /obs line/);
  const fb = fixPrompt(a, planFix(a, { today: TODAY }), { observations: [], attempt: 2, feedback: { 'story.blocks[0].text': 'The rewrite was too long (205 characters).' } });
  assert.match(fb.user, /YOUR PREVIOUS REWRITE WAS REJECTED: The rewrite was too long/);
  assert.equal(MAX_FIX_ATTEMPTS, 3);
  assert.equal(issueKey({ code: 'attention', section: 'macro', message: 'a' }), issueKey({ code: 'attention', section: 'macro', message: 'b' }));
});
