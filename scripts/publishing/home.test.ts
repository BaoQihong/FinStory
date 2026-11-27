// Unit tests for the Phase 3C homepage helpers (pure code, no database).
// The live lifecycle (publish → homepage, feature, republish, unpublish
// fallback) is exercised over HTTP by scripts/publishing/home-check.ts.
// The stories below are TEST FIXTURES ONLY: they never reach a published page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_PAGE_SIZE, leadChart, parsePage, resolveFeaturedId, toCard } from '../../lib/publishing/home.ts';
import { toPublicSnapshot, type PublicStory } from '../../lib/publishing/snapshot.ts';
import { content } from './fixture.ts';

function pub(id: string, headline: string, over: Partial<PublicStory> = {}): PublicStory {
  return { id, slug: `fixture-${id}`, revision: 1, firstPublishedAt: '2026-11-20T10:00:00Z', publishedAt: '2026-11-20T10:00:00Z', story: toPublicSnapshot(content(headline)), ...over };
}

test('featured article: explicit live choice, else the newest live story', () => {
  const live = [{ id: 'c' }, { id: 'b' }, { id: 'a' }]; // newest first
  assert.equal(resolveFeaturedId('b', live), 'b');
  assert.equal(resolveFeaturedId(null, live), 'c', 'nothing featured → newest');
  assert.equal(resolveFeaturedId('gone', live), 'c', 'featured but no longer live → newest');
  assert.equal(resolveFeaturedId(null, []), null, 'no live stories → no featured story');
  assert.equal(resolveFeaturedId('b', []), null);
});

test('page parameter is bounded and defaults to 1', () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage('2'), 2);
  assert.equal(parsePage(['3', '4']), 3);
  for (const bad of ['0', '-1', '1.5', 'abc', '02', '99999', '501', '']) assert.equal(parsePage(bad), 1, bad);
  assert.ok(HOME_PAGE_SIZE >= 6);
});

test('card model: public fields only, story URL, original and updated dates', () => {
  const card = toCard(pub('a1', 'A fixture headline', { publishedAt: '2026-11-25T09:00:00Z' }))!;
  assert.equal(card.href, '/story/fixture-a1');
  assert.equal(card.headline, 'A fixture headline');
  assert.equal(card.dek, 'Integration test fixture.');
  assert.equal(card.section, 'markets');
  assert.deepEqual(card.author, { name: 'Seshat Editorial', role: 'Editorial team' });
  assert.equal(card.date, '2026-11-20');
  assert.equal(card.updated, '2026-11-25');
  assert.equal(card.artwork, null);
  const json = JSON.stringify(card);
  for (const leak of ['PRIVATE-FINDING-MARKER', 'PRIVATE-JOB-MARKER', 'workingTitle', '[Publish check]']) assert.ok(!json.includes(leak), leak);
  assert.equal(toCard(pub('a2', 'Same day'))!.updated, undefined, 'no "updated" when never republished');
});

test('card model: fact tokens resolve; unresolvable copy skips the card', () => {
  const s = pub('t1', 'Yields at {y10}');
  s.story.data.facts = { y10: { value: 4.256, format: 'pct', decimals: 2, seriesIds: ['DGS10'], method: 'fixture' } };
  assert.equal(toCard(s)!.headline, 'Yields at 4.26%');
  const bad = pub('t2', 'Broken {missing}');
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(toCard(bad), null);
  } finally {
    console.error = err;
  }
});

test('lead chart artwork comes from the article’s own first chart, or is absent', () => {
  const s = pub('c1', 'Chart story');
  assert.equal(leadChart(s, (x) => x), null, 'no charts → typographic layout');
  const points = Array.from({ length: 600 }, (_, i) => ({ date: new Date(Date.UTC(2000, i, 1)).toISOString().slice(0, 10), value: i / 10 }));
  s.story.macro.charts = [{ chartId: 'missing', question: 'Q0', takeaway: 'T0' }, { chartId: 'k', question: 'How far have yields moved?', takeaway: 'T' }];
  s.story.data.charts = {
    k: {
      id: 'k',
      series: [
        { key: 'a', label: 'Series A', color: 'nominal', points },
        { key: 'b', label: 'Series B', color: 'real', points },
        { key: 'c', label: 'Series C', color: 'policy', points },
      ],
      annotations: [],
      xTickFormat: 'year',
      sources: [{ seriesId: 'X', name: 'X', provider: 'FRED', url: 'https://fred.stlouisfed.org', units: '%', frequency: 'm', retrievedAt: '2026-11-27', lastObservation: '2049-12-01' }],
      notes: [],
    },
  };
  const art = leadChart(s, (x) => x)!;
  assert.equal(art.question, 'How far have yields moved?');
  assert.equal(art.series.length, 2, 'at most two lines');
  assert.ok(art.series[0].points.length <= 240, 'thinned');
  assert.equal(art.series[0].points.at(-1)!.date, points.at(-1)!.date, 'keeps the latest point');
  assert.equal(art.first, '2000-01-01');
  assert.equal(art.source, 'Source: FRED');
  assert.deepEqual(art.unit, { prefix: '', suffix: '%' });
  assert.ok(toCard(s, true)!.artwork);
});
