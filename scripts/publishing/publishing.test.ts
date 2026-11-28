// Unit tests for the Phase 3A publishing rules (pure code, no database).
// Database behaviour (atomicity, RLS, concurrency) is exercised against the
// real Supabase project by scripts/publishing/publish-check.ts.
// The article below is a TEST FIXTURE ONLY: it never reaches a published page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPublication, publicationState, RESERVED_SLUGS, slugify, slugProblem, uniqueSlug } from '../../lib/publishing/rules.ts';
import { PublishedStoryV1, toPublicSnapshot } from '../../lib/publishing/snapshot.ts';
import { SeshatArticleV1, type SeshatArticle } from '../../lib/studio/schema.ts';
import { DRAFT_FOOTER, PUBLIC_FOOTER, fromDraft, fromSnapshot } from '../../lib/content/render-model.ts';

const TODAY = '2026-11-27';
const ok = { required: false, reasons: [] as string[] };

function fixture(): SeshatArticle {
  return SeshatArticleV1.parse({
    schemaVersion: 1,
    meta: { workingTitle: 'Internal working title', section: 'markets', author: { name: 'Seshat Editorial', role: 'Editorial team' }, asOf: '2026-11-20', createdAt: '2026-11-21T00:00:00Z', updatedAt: '2026-11-22T00:00:00Z' },
    story: {
      kicker: 'Rates',
      headline: 'A test headline about rates',
      dek: 'A short dek.',
      keyPoints: ['Point one.'],
      blocks: [
        { type: 'p', text: 'Paragraph one.' },
        { type: 'p', text: 'Paragraph two.' },
        { type: 'p', text: 'Paragraph three.' },
      ],
      attention: ok,
    },
    macro: { title: 'Macro', intro: 'Intro.', indicators: [], charts: [], explainers: [{ title: 'Context', text: 'Some context.', evidence: 'context' }], attention: ok },
    analytics: {
      title: 'Analytics',
      intro: 'Intro.',
      chain: { title: 'Chain', steps: [{ title: 'A', text: 'Step A.', evidence: 'interpretation' }, { title: 'B', text: 'Step B.', evidence: 'interpretation' }] },
      charts: [],
      comparisons: [],
      implications: { title: 'Implications', intro: 'Intro.', items: [{ asset: 'Bonds', icon: 'bonds', shows: 'Shows.', showsEvidence: 'context', couldMean: 'Could mean.' }] },
      attention: ok,
    },
    outlook: {
      title: 'Outlook',
      intro: 'Intro.',
      disclaimer: 'Not a forecast.',
      scenarios: ['central', 'alternative'].map((role, i) => ({ key: `s${i}`, name: `Scenario ${i}`, role, summary: 'Summary.', conditions: ['Condition.'], whyItMatters: 'Matters.', assets: [{ asset: 'Bonds', effect: 'Effect.' }], watch: ['Watch.'], uncertainties: ['Uncertain.'] })),
      attention: ok,
    },
    methodology: ['Method note.'],
    evidence: {
      citations: [{ ref: 'S1', title: 'A source', url: 'https://example.org/a', publisher: 'example.org', sourceType: 'primary', publishedAt: '2026-11-01' }],
      gaps: [{ need: 'Some dataset', reason: 'provider-unavailable', provider: 'eia' }],
      findings: [{ ref: 'F1', claim: 'INTERNAL finding text', kind: 'documented', sourceRefs: ['S1'], quoteVerified: true }],
    },
    data: { facts: {}, dates: {}, charts: {}, indicators: [], sources: [] },
    validation: { checkedAt: '2026-11-22T00:00:00Z', issues: [], claims: [] },
    generation: { jobId: 'job-internal-id', model: 'internal-model', searchProvider: 'tavily', dataProviders: ['fred'], generatedAt: '2026-11-21T00:00:00Z' },
  });
}

// ── State ────────────────────────────────────────────────────────────────
test('publication state is derived from the publication columns', () => {
  assert.equal(publicationState({ revision: 3, is_live: false, first_published_at: null, published_source_revision: null }), 'never');
  assert.equal(publicationState({ revision: 3, is_live: true, first_published_at: 'x', published_source_revision: 3 }), 'live');
  assert.equal(publicationState({ revision: 4, is_live: true, first_published_at: 'x', published_source_revision: 3 }), 'live_changed');
  assert.equal(publicationState({ revision: 4, is_live: false, first_published_at: 'x', published_source_revision: 3 }), 'unpublished');
});

// ── Slugs ────────────────────────────────────────────────────────────────
test('slugify produces clean, bounded slugs', () => {
  assert.equal(slugify('The Yen’s Long Slide: What Comes Next?'), 'the-yens-long-slide-what-comes-next');
  assert.equal(slugify('Café & Crédit — 2026'), 'cafe-and-credit-2026');
  const long = slugify('word '.repeat(40));
  assert.ok(long.length <= 80 && !long.endsWith('-'), long);
});

test('slug validation and duplicate handling', () => {
  assert.equal(slugProblem('good-slug'), null);
  assert.match(slugProblem('Bad Slug')!, /lowercase/);
  assert.match(slugProblem('a--b')!, /lowercase/);
  assert.match(slugProblem('ab')!, /at least 3/);
  assert.match(slugProblem('admin')!, /reserved/);
  assert.equal(uniqueSlug('rates', new Set()), 'rates');
  assert.equal(uniqueSlug('rates', new Set(['rates', 'rates-2'])), 'rates-3');
  assert.equal(uniqueSlug('story', new Set(), RESERVED_SLUGS), 'story-2');
  assert.equal(uniqueSlug('the-bond-comeback', new Set(), new Set([...RESERVED_SLUGS, 'the-bond-comeback'])), 'the-bond-comeback-2');
});

// ── Validation ───────────────────────────────────────────────────────────
const input = (content: unknown, extra: Partial<{ isTemporary: boolean; generating: boolean }> = {}) => ({ content, isTemporary: false, generating: false, today: TODAY, ...extra });

test('a valid draft can be published', () => {
  const r = checkPublication(input(fixture()));
  assert.equal(r.ok, true, JSON.stringify(r.blocking));
  assert.deepEqual(r.blocking, []);
});

test('missing or structurally invalid content is blocked', () => {
  assert.equal(checkPublication(input(null)).blocking[0].code, 'no-content');
  const bad = fixture() as unknown as Record<string, Record<string, unknown>>;
  bad.story.headline = '';
  const r = checkPublication(input(bad));
  assert.equal(r.ok, false);
  assert.ok(r.blocking.some((i) => i.code === 'schema' && i.message.includes('story.headline')));
  const extra = { ...fixture(), fifth: {} };
  assert.equal(checkPublication(input(extra)).ok, false);
});

test('unresolved attention, temporary drafts and running generation block publication', () => {
  const a = fixture();
  a.macro.attention = { required: true, reasons: ['Inflation figure unverified'] };
  const r = checkPublication(input(a));
  assert.equal(r.ok, false);
  assert.ok(r.blocking.some((i) => i.code === 'attention' && i.section === 'macro' && i.message.includes('Inflation figure unverified')));
  assert.equal(checkPublication(input(fixture(), { isTemporary: true })).blocking[0].code, 'temporary-draft');
  assert.equal(checkPublication(input(fixture(), { generating: true })).blocking[0].code, 'generation-running');
});

test('validation errors block, warnings do not', () => {
  const a = fixture();
  a.story.blocks[0] = { type: 'p', text: 'Yields hit {noSuchFact} this year.' };
  const r = checkPublication(input(a));
  assert.equal(r.ok, false);
  assert.ok(r.blocking.some((i) => i.code === 'unknown-token'));

  const w = fixture();
  w.outlook.scenarios = [];
  w.meta.asOf = '2026-01-01'; // stale data
  w.data.sources = [{ seriesId: 'SPY', name: 'SPDR', provider: 'Tiingo', url: 'https://api.tiingo.com', units: 'USD', frequency: 'Daily', retrievedAt: 'x', lastObservation: 'x' }];
  const rw = checkPublication(input(w));
  assert.equal(rw.ok, true, JSON.stringify(rw.blocking));
  const codes = rw.warnings.map((i) => i.code);
  for (const c of ['no-scenarios', 'stale-data', 'tiingo-licence']) assert.ok(codes.includes(c), `${c} in ${codes}`);
});

test('a single central scenario is a complete Outlook (D-063)', () => {
  const a = fixture();
  a.outlook.scenarios = a.outlook.scenarios.slice(0, 1);
  const r = checkPublication(input(a));
  assert.equal(r.ok, true, JSON.stringify(r.blocking));
  const outlook = [...r.blocking, ...r.warnings].filter((i) => /scenario/.test(i.code));
  assert.deepEqual(outlook, [], JSON.stringify(outlook));
});

// ── Snapshot ─────────────────────────────────────────────────────────────
test('public snapshot keeps render content and drops internal fields', () => {
  const a = fixture();
  const s = toPublicSnapshot(a);
  assert.equal(PublishedStoryV1.safeParse(s).success, true);
  assert.equal(s.story.headline, a.story.headline);
  assert.deepEqual(s.meta, { section: 'markets', author: a.meta.author, asOf: '2026-11-20' });
  assert.deepEqual(s.citations, a.evidence.citations);
  assert.deepEqual(s.data, a.data);
  const json = JSON.stringify(s);
  for (const secret of ['INTERNAL finding text', 'job-internal-id', 'internal-model', 'Internal working title', 'attention', 'validation', 'provider-unavailable'])
    assert.ok(!json.includes(secret), `snapshot leaks ${secret}`);
});

test('snapshot is a copy: later draft edits do not change it', () => {
  const a = fixture();
  const s = toPublicSnapshot(a);
  a.story.headline = 'Edited after publication';
  (a.story.blocks[0] as { text: string }).text = 'Changed.';
  a.methodology.push('New note.');
  assert.equal(s.story.headline, 'A test headline about rates');
  assert.equal((s.story.blocks[0] as { text: string }).text, 'Paragraph one.');
  assert.equal(s.methodology.length, 1);
});

// ── Phase 3B.1: shared renderer (WYSIWYG) ────────────────────────────────
// The public page and the editorial preview render the same ArticleView from
// the same render model; these tests pin that the model is identical for the
// same content, except header dates, the footer note and attention notes.

const withAttention = () => {
  const d = fixture();
  d.macro.attention = { required: true, reasons: ['PRIVATE-EDITOR-NOTE'] };
  return d;
};

test('public render model equals the preview render model for the same content', () => {
  const draft = withAttention();
  const preview = fromDraft(draft);
  const pub = fromSnapshot(toPublicSnapshot(draft), { firstPublishedAt: '2026-11-25T10:00:00Z', publishedAt: '2026-11-25T12:00:00Z' });
  const strip = (m: ReturnType<typeof fromDraft>) => {
    const a = structuredClone(m.article) as Record<string, unknown> & { [k: string]: unknown };
    for (const s of ['story', 'macro', 'analytics', 'outlook']) delete (a[s] as Record<string, unknown>).attention;
    delete a.date;
    delete a.updated;
    delete a.footerNote;
    return { article: a, data: m.data };
  };
  assert.deepEqual(strip(pub), strip(preview));
  assert.equal(preview.article.footerNote, DRAFT_FOOTER);
  assert.equal(pub.article.footerNote, PUBLIC_FOOTER);
});

test('public render model carries no attention notes and uses publication dates', () => {
  const draft = withAttention();
  const pub = fromSnapshot(toPublicSnapshot(draft), { firstPublishedAt: '2026-11-25T10:00:00Z', publishedAt: '2026-11-27T09:00:00Z' });
  assert.ok(!JSON.stringify(pub).includes('PRIVATE-EDITOR-NOTE'));
  for (const s of ['story', 'macro', 'analytics', 'outlook'] as const) assert.equal(pub.article[s].attention, undefined);
  assert.equal(pub.article.date, '2026-11-25');
  assert.equal(pub.article.updated, '2026-11-27');
  const same = fromSnapshot(toPublicSnapshot(draft), { firstPublishedAt: '2026-11-25T10:00:00Z', publishedAt: '2026-11-25T18:00:00Z' });
  assert.equal(same.article.updated, undefined);
  // The preview keeps the editor's attention notes.
  assert.deepEqual(fromDraft(draft).article.macro.attention, { required: true, reasons: ['PRIVATE-EDITOR-NOTE'] });
});

test('fromDraft mapping is unchanged from Phase 2B (regression reference)', () => {
  const c = withAttention();
  // The Phase 2B mapping, verbatim, as the reference.
  const legacy = {
    section: c.meta.section,
    headline: c.story.headline,
    dek: c.story.dek,
    byline: c.meta.author,
    date: c.meta.updatedAt.slice(0, 10),
    dataCutoff: c.meta.asOf,
    keyPoints: c.story.keyPoints,
    story: { id: 'story', label: 'The Story', title: c.story.headline, blocks: c.story.blocks, attention: c.story.attention },
    macro: { id: 'macro', label: 'Macro', ...c.macro },
    analytics: { id: 'analytics', label: 'Analytics', ...c.analytics, charts: c.analytics.charts, comparisons: c.analytics.comparisons },
    outlook: { id: 'outlook', label: 'Outlook', ...c.outlook },
    methodology: c.methodology,
    citations: c.evidence.citations.map((x) => ({ label: x.title, url: x.url, note: x.ref, publisher: x.publisher, publishedAt: x.publishedAt })),
    footerNote: DRAFT_FOOTER,
  };
  assert.deepEqual(fromDraft(c).article, legacy);
});
