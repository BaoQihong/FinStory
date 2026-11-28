// "Delete draft" (D-062): the shared rule and the server-side core, against a
// fake Supabase client that records every query. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteDraft } from '../../lib/studio/delete-rules.ts';
import { AI_IN_FLIGHT_MS, deleteDraftCore, type DeleteDb } from '../../lib/studio/delete-draft.ts';

const ID = '0343f191-8fe4-4cd3-8ed9-22202733c7ea';
const NOW = Date.parse('2026-11-28T18:00:00Z');

// ── The rule ─────────────────────────────────────────────────────────────
test('rule: a never-published, idle draft can be deleted', () => {
  assert.deepEqual(canDeleteDraft({ firstPublishedAt: null, isLive: false, generating: false }), { ok: true });
});

test('rule: anything ever published cannot be deleted (live, or unpublished later)', () => {
  const live = canDeleteDraft({ firstPublishedAt: '2026-11-27T10:00:00Z', isLive: true, generating: false });
  assert.equal(live.ok, false);
  assert.equal(!live.ok && live.kind, 'published');
  assert.match(!live.ok ? live.reason : '', /Unpublish/);
  const was = canDeleteDraft({ firstPublishedAt: '2026-11-27T10:00:00Z', isLive: false, generating: false });
  assert.equal(!was.ok && was.kind, 'published');
  // Published wins over busy: the reason shown is the permanent one.
  assert.equal((canDeleteDraft({ firstPublishedAt: 'x', isLive: false, generating: true }) as { kind: string }).kind, 'published');
});

test('rule: not while generating, Polish or Fix It is working on the draft', () => {
  const gen = canDeleteDraft({ firstPublishedAt: null, isLive: false, generating: true });
  assert.equal(!gen.ok && gen.kind, 'busy');
  const ai = canDeleteDraft({ firstPublishedAt: null, isLive: false, generating: false, aiBusy: true });
  assert.equal(!ai.ok && ai.kind, 'busy');
  assert.match(!ai.ok ? ai.reason : '', /Polish|Fix It/);
});

// ── The core, with a recording fake client ───────────────────────────────
type Q = { table: string; op: 'select' | 'delete'; filters: [string, string, unknown][]; cols?: string };
type Article = { id: string; working_title: string; is_live: boolean; first_published_at: string | null };
function fakeDb(state: { article?: Article | null; jobs?: unknown[]; slots?: unknown[]; deleteError?: { code?: string; message: string }; publishBeforeDelete?: boolean }) {
  const queries: Q[] = [];
  const resolve = (q: Q) => {
    if (q.op === 'delete') {
      if (state.deleteError) return { data: null, error: state.deleteError };
      const a = state.article;
      if (a && state.publishBeforeDelete) a.first_published_at = '2026-11-28T17:59:59Z';
      const match = !!a && q.filters.every(([f, k, v]) => (f === 'is' ? (a as Record<string, unknown>)[k] === v : f === 'eq' ? (a as Record<string, unknown>)[k] === v : true));
      if (!match) return { data: [], error: null };
      state.article = null;
      return { data: [{ id: a!.id }], error: null };
    }
    if (q.table === 'articles') return { data: state.article ?? null, error: null };
    if (q.table === 'generation_jobs') return { data: state.jobs ?? [], error: null };
    if (q.table === 'api_usage') return { data: state.slots ?? [], error: null };
    return { data: null, error: { message: 'unexpected table' } };
  };
  const builder = (q: Q) => {
    const b: Record<string, unknown> = {};
    for (const f of ['eq', 'in', 'gte', 'is']) b[f] = (k: string, v: unknown) => (q.filters.push([f, k, v]), b);
    b.limit = () => b;
    b.select = (cols: string) => ((q.cols = cols), b);
    b.maybeSingle = () => b;
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resolve(q)).then(ok, bad);
    return b;
  };
  const db = {
    from(table: string) {
      return {
        select: (cols: string) => {
          const q: Q = { table, op: 'select', filters: [], cols };
          queries.push(q);
          return builder(q);
        },
        delete: () => {
          const q: Q = { table, op: 'delete', filters: [] };
          queries.push(q);
          return builder(q);
        },
      };
    },
  } as DeleteDb;
  return { db, queries, state };
}
const draft = (over: Partial<Article> = {}): Article => ({ id: ID, working_title: '[test] Households', is_live: false, first_published_at: null, ...over });
const deletes = (qs: Q[]) => qs.filter((q) => q.op === 'delete');

test('core: deletes a never-published draft, filtered on "never published and not live"', async () => {
  const f = fakeDb({ article: draft() });
  const r = await deleteDraftCore(f.db, ID, () => NOW);
  assert.deepEqual(r, { ok: true, title: '[test] Households' });
  const [d] = deletes(f.queries);
  assert.equal(d.table, 'articles');
  assert.deepEqual(d.filters, [['eq', 'id', ID], ['is', 'first_published_at', null], ['eq', 'is_live', false]]);
  assert.equal(f.state.article, null);
});

test('core: refuses published articles and never issues a delete', async () => {
  for (const a of [draft({ is_live: true, first_published_at: '2026-11-27T10:00:00Z' }), draft({ first_published_at: '2026-11-27T10:00:00Z' })]) {
    const f = fakeDb({ article: a });
    const r = await deleteDraftCore(f.db, ID, () => NOW);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : '', /cannot be deleted/);
    assert.equal(deletes(f.queries).length, 0);
  }
});

test('core: refuses while a generation job is active, or a Polish/Fix reservation is in flight', async () => {
  const gen = fakeDb({ article: draft(), jobs: [{ id: 'j' }] });
  const r1 = await deleteDraftCore(gen.db, ID, () => NOW);
  assert.match(!r1.ok ? r1.error : '', /being generated/);
  assert.equal(deletes(gen.queries).length, 0);
  const jobQ = gen.queries.find((q) => q.table === 'generation_jobs')!;
  assert.deepEqual(jobQ.filters, [['eq', 'article_id', ID], ['in', 'status', ['queued', 'running']]]);

  const ai = fakeDb({ article: draft(), slots: [{ id: 1 }] });
  const r2 = await deleteDraftCore(ai.db, ID, () => NOW);
  assert.match(!r2.ok ? r2.error : '', /Polish or Fix It/);
  assert.equal(deletes(ai.queries).length, 0);
  const slotQ = ai.queries.find((q) => q.table === 'api_usage')!;
  assert.deepEqual(slotQ.filters, [['eq', 'article_id', ID], ['in', 'stage', ['polish', 'fix']], ['eq', 'calls', 0], ['gte', 'created_at', new Date(NOW - AI_IN_FLIGHT_MS).toISOString()]]);
});

test('core: a draft published between the check and the delete is not removed', async () => {
  const f = fakeDb({ article: draft(), publishBeforeDelete: true });
  const r = await deleteDraftCore(f.db, ID, () => NOW);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : '', /published or changed meanwhile/);
  assert.ok(f.state.article, 'article still exists');
});

test('core: database errors are reported and nothing is claimed deleted', async () => {
  const fk = await deleteDraftCore(fakeDb({ article: draft(), deleteError: { code: '23503', message: 'violates foreign key constraint' } }).db, ID, () => NOW);
  assert.deepEqual(fk, { ok: false, error: 'This article has publication history and cannot be deleted.' });
  const other = await deleteDraftCore(fakeDb({ article: draft(), deleteError: { message: 'permission denied for table articles' } }).db, ID, () => NOW);
  assert.match(!other.ok ? other.error : '', /could not be deleted \(permission denied.*Nothing was removed/);
});

test('core: invalid or missing ids', async () => {
  const f = fakeDb({ article: draft() });
  assert.deepEqual(await deleteDraftCore(f.db, 'not-a-uuid'), { ok: false, error: 'Invalid request.' });
  assert.equal(f.queries.length, 0, 'no query for an invalid id');
  const gone = await deleteDraftCore(fakeDb({ article: null }).db, ID, () => NOW);
  assert.match(!gone.ok ? gone.error : '', /no longer exists/);
});
