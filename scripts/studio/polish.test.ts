// Unit tests for Editorial Polish (Phase 3B.2): the field whitelist, the
// deterministic checks on proposed prose, stale-proposal refusal and the
// guarantee that nothing outside accepted prose fields changes.
// The article below is a TEST FIXTURE ONLY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRevisions, buildProposal, checkRevision, polishableFields, polishPrompt, PolishOut } from '../../lib/editorial/polish.ts';
import { STYLE_GUIDE_VERSION } from '../../lib/editorial/style-guide.ts';
import { SeshatArticleV1, type SeshatArticle } from '../../lib/studio/schema.ts';

const ok = { required: false, reasons: [] as string[] };
const fact = (value: number) => ({ value, format: 'pct', decimals: 1, seriesIds: ['X'], method: 'Year-over-year change in the test index', date: '2026-10-01', datePrecision: 'month' });

function fixture(): SeshatArticle {
  return SeshatArticleV1.parse({
    schemaVersion: 1,
    meta: { workingTitle: 'Polish fixture', section: 'economy', author: { name: 'Seshat Editorial', role: 'Editor' }, asOf: '2026-10-01', createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-21T00:00:00Z' },
    story: {
      kicker: 'Prices',
      headline: 'PROTECTED-HEADLINE',
      dek: 'Inflation has slowed, but prices have not fallen.',
      keyPoints: ['Prices rose {cpiYoy} in the year to {cpiYoy.date}.'],
      blocks: [
        { type: 'p', text: 'In today’s evolving landscape, it is worth noting that prices rose {cpiYoy} over the year, and wages may not keep up.' },
        { type: 'chart', chartId: 'c1', question: 'PROTECTED-CHART-QUESTION', takeaway: 'PROTECTED-TAKEAWAY {cpiYoy}' },
        { type: 'p', text: 'The central bank said it was “not yet confident” that inflation would return to target, according to S1.' },
      ],
      attention: ok,
    },
    macro: { title: 'PROTECTED-TITLE', intro: 'The numbers show {coreYoy} core inflation.', indicators: [{ key: 'cpi', note: 'Why this matters.' }], charts: [], explainers: [{ title: 'Context', text: 'Some context.', evidence: 'context' }], attention: ok },
    analytics: {
      title: 'Analytics',
      intro: 'Why it happens.',
      chain: { title: 'Chain', steps: [{ title: 'A', text: 'Rates rose, which could slow demand.', evidence: 'interpretation' }, { title: 'B', text: 'Step B.', evidence: 'interpretation' }] },
      charts: [],
      comparisons: [],
      implications: { title: 'Implications', intro: 'For households.', items: [{ asset: 'Bonds', icon: 'bonds', shows: 'PROTECTED-SHOWS', showsEvidence: 'context', couldMean: 'PROTECTED-COULDMEAN' }] },
      attention: ok,
    },
    outlook: {
      title: 'Outlook',
      intro: 'What next.',
      disclaimer: 'PROTECTED-DISCLAIMER',
      scenarios: [{ key: 's1', name: 'Cooling', role: 'central', summary: 'Inflation keeps easing if wages slow.', conditions: ['PROTECTED-CONDITION'], whyItMatters: 'Savers gain.', assets: [{ asset: 'Bonds', effect: 'PROTECTED-EFFECT' }], watch: ['PROTECTED-WATCH'], uncertainties: ['PROTECTED-UNCERTAINTY'] }],
      attention: ok,
    },
    methodology: ['PROTECTED-METHOD'],
    evidence: { citations: [], findings: [] },
    data: { facts: { cpiYoy: fact(3.1), coreYoy: fact(2.9) }, dates: {}, charts: {}, indicators: [], sources: [] },
    validation: { checkedAt: '2026-11-21T00:00:00Z', issues: [], claims: [] },
    generation: { jobId: 'j', model: 'm', searchProvider: 's', dataProviders: [], generatedAt: '2026-11-20T00:00:00Z' },
  });
}
const ctx = (a: SeshatArticle, max = 1600) => ({ max, facts: a.data.facts, dates: a.data.dates });

test('only reader-facing prose fields are polishable; protected fields never are', () => {
  const a = fixture();
  const all = (['story', 'macro', 'analytics', 'outlook'] as const).flatMap((s) => polishableFields(a, s));
  const text = JSON.stringify(all);
  for (const marker of ['PROTECTED-HEADLINE', 'PROTECTED-CHART-QUESTION', 'PROTECTED-TAKEAWAY', 'PROTECTED-TITLE', 'PROTECTED-SHOWS', 'PROTECTED-COULDMEAN', 'PROTECTED-DISCLAIMER', 'PROTECTED-CONDITION', 'PROTECTED-EFFECT', 'PROTECTED-WATCH', 'PROTECTED-UNCERTAINTY', 'PROTECTED-METHOD'])
    assert.ok(!text.includes(marker), `${marker} is editable`);
  assert.deepEqual(
    polishableFields(a, 'story').map((f) => f.path),
    ['story.dek', 'story.keyPoints[0]', 'story.blocks[0].text', 'story.blocks[2].text'],
  );
});

test('a pure style revision passes cleanly', () => {
  const a = fixture();
  const before = a.story.blocks[0].type === 'p' ? a.story.blocks[0].text : '';
  const r = checkRevision(before, 'Prices rose {cpiYoy} over the year, and wages may not keep up.', ctx(a));
  assert.equal(r.status, 'ok', JSON.stringify(r.reasons));
});

test('removed, added or unknown fact tokens are caught', () => {
  const a = fixture();
  assert.equal(checkRevision('Prices rose {cpiYoy}.', 'Prices rose sharply.', ctx(a)).status, 'flagged');
  assert.equal(checkRevision('Prices rose {cpiYoy}.', 'Prices rose {cpiYoy}; core was {coreYoy}.', ctx(a)).status, 'flagged');
  const bad = checkRevision('Prices rose {cpiYoy}.', 'Prices rose {cpiYoyy}.', ctx(a));
  assert.equal(bad.status, 'rejected');
  assert.match(bad.reasons.map((r) => r.message).join(' '), /Unknown fact token/);
});

test('numbers typed into prose, changed years and changed quotations are flagged as material', () => {
  const a = fixture();
  const n = checkRevision('Prices rose {cpiYoy}.', 'Prices rose {cpiYoy}, about 3.1% a year.', ctx(a));
  assert.equal(n.status, 'flagged');
  assert.ok(n.reasons.some((r) => r.severity === 'material' && /typed into the text/.test(r.message)));
  assert.equal(checkRevision('Prices peaked in 2022.', 'Prices peaked in 2021.', ctx(a)).status, 'flagged');
  const q = checkRevision('It was “not yet confident” about inflation, according to S1.', 'It was not confident about inflation, according to S1.', ctx(a));
  assert.ok(q.reasons.some((r) => /Quoted text/.test(r.message)));
  assert.ok(checkRevision('As S1 reports.', 'As S2 reports.', ctx(a)).reasons.some((r) => /Source references/.test(r.message)));
  assert.ok(checkRevision('Prices rose.', 'Prices rose, as one economist said, “faster than anyone expected”.', ctx(a)).reasons.some((r) => /New quotation/.test(r.message)));
});

test('a hedge turned into a certainty is flagged for review', () => {
  const a = fixture();
  const r = checkRevision('Rates rose, which could slow demand.', 'Rates rose, which will slow demand.', ctx(a));
  assert.equal(r.status, 'flagged');
  assert.ok(r.reasons.some((x) => x.severity === 'check' && /could/.test(x.message) && /will/.test(x.message)));
});

test('length limits, markup and empty text are rejected', () => {
  const a = fixture();
  assert.equal(checkRevision('Short.', 'x'.repeat(401), ctx(a, 400)).status, 'rejected');
  assert.equal(checkRevision('Short.', '<b>Bold</b> claim.', ctx(a)).status, 'rejected');
  assert.equal(checkRevision('Short.', 'See https://example.com.', ctx(a)).status, 'rejected');
  assert.equal(checkRevision('Short.', '   ', ctx(a)).status, 'rejected');
});

test('proposal keeps only whitelisted, changed fields; unknown paths are discarded', () => {
  const a = fixture();
  const out = PolishOut.parse({
    revisions: [
      { path: 'story.blocks[0].text', text: 'Prices rose {cpiYoy} over the year, and wages may not keep up.' },
      { path: 'story.headline', text: 'A new headline' },
      { path: 'story.blocks[1].takeaway', text: 'changed takeaway' },
      { path: 'data.facts.cpiYoy.value', text: '9' },
      { path: 'story.dek', text: 'Inflation has slowed, but prices have not fallen.' },
    ],
    concerns: [{ path: 'story.blocks[2].text', concern: 'Attribution to S1 should be checked.' }],
  });
  const p = buildProposal(a, 'story', 7, out);
  assert.deepEqual(p.items.map((i) => i.path), ['story.blocks[0].text']);
  assert.equal(p.discarded, 4);
  assert.equal(p.baseRevision, 7);
  assert.equal(p.styleGuideVersion, STYLE_GUIDE_VERSION);
  assert.equal(p.concerns.length, 1);
});

test('applying accepted revisions changes only those fields and leaves the original untouched', () => {
  const a = fixture();
  const original = structuredClone(a);
  const before = (a.story.blocks[0] as { text: string }).text;
  const after = 'Prices rose {cpiYoy} over the year, and wages may not keep up.';
  const r = applyRevisions(a, 'story', [{ path: 'story.blocks[0].text', before, after }]);
  assert.ok(r.ok);
  assert.deepEqual(a, original, 'input draft mutated');
  const expected = structuredClone(original);
  (expected.story.blocks[0] as { text: string }).text = after;
  assert.deepEqual(r.content, expected, 'something other than the accepted field changed');
});

test('stale, out-of-section, protected or invalid revisions are refused and nothing is applied', () => {
  const a = fixture();
  const before = (a.story.blocks[0] as { text: string }).text;
  const stale = applyRevisions(a, 'story', [{ path: 'story.blocks[0].text', before: 'an older version of the paragraph', after: 'New text {cpiYoy}.' }]);
  assert.equal(stale.ok, false);
  assert.match((stale as { error: string }).error, /changed since/);
  assert.equal(applyRevisions(a, 'story', [{ path: 'macro.intro', before: a.macro.intro, after: 'x' }]).ok, false);
  assert.equal(applyRevisions(a, 'story', [{ path: 'story.headline', before: a.story.headline, after: 'x' }]).ok, false);
  assert.equal(applyRevisions(a, 'outlook', [{ path: 'outlook.scenarios[0].conditions[0]', before: 'PROTECTED-CONDITION', after: 'x' }]).ok, false);
  assert.equal(applyRevisions(a, 'story', [{ path: 'story.blocks[0].text', before, after: 'Prices rose {nope}.' }]).ok, false);
});

test('the polish prompt carries the style guide, the author intent and the whole article, but lists only the section fields as editable', () => {
  const a = fixture();
  const { user, fields } = polishPrompt(a, 'macro', { prompt: 'p'.repeat(25), argument: 'ARGUMENT-MARKER', voice: 'VOICE-MARKER' });
  assert.match(user, /SESHAT EDITORIAL STYLE GUIDE/);
  assert.match(user, /ARGUMENT-MARKER/);
  assert.match(user, /VOICE-MARKER/);
  assert.ok(user.includes('Inflation keeps easing if wages slow.'), 'whole-article context missing');
  assert.ok(fields.every((f) => f.path.startsWith('macro.')));
  const editable = user.slice(user.indexOf('FIELDS YOU MAY REVISE'));
  assert.ok(!editable.includes('[story.'), 'story fields offered as editable in a macro polish');
});

test('a flagged revision is applied only with explicit acknowledgement (enforced server-side, not just in the UI)', () => {
  const a = fixture();
  const before = (a.story.blocks[0] as { text: string }).text;
  const after = 'Prices rose {cpiYoy} over the year, and wages will not keep up.'; // "may" → "will": flagged
  const r = applyRevisions(a, 'story', [{ path: 'story.blocks[0].text', before, after }]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /explicit confirmation/);
  assert.ok(applyRevisions(a, 'story', [{ path: 'story.blocks[0].text', before, after, acknowledged: true }]).ok);
});

test('dissolving a formulaic contrast is not flagged as a change of claim; a hedge change still is', () => {
  const a = fixture();
  assert.equal(checkRevision('The gap is not a statistical error; it is a structural lag.', 'The gap is a structural lag.', ctx(a)).status, 'ok');
  assert.equal(checkRevision('The industry is not a monolith; it is a web of firms.', 'The industry is a web of firms.', ctx(a)).status, 'ok');
  assert.equal(checkRevision('The gap is not a statistical error; it may be a structural lag.', 'The gap will be a structural lag.', ctx(a)).status, 'flagged');
  assert.equal(checkRevision('Prices are not falling.', 'Prices are falling.', ctx(a)).status, 'flagged');
});
