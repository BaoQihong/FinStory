// Phase 3A integration check against the real Supabase project.
//
// Runs the publication lifecycle on a dedicated fixture article under the
// EDITOR's own session (RLS and the SECURITY DEFINER functions exactly as in
// production) and checks public access with the anon (publishable) key.
// The secret key is used ONLY to delete the fixture articles and their
// publication history afterwards — the application never uses it.
//
// Usage: node scripts/publishing/publish-check.ts
// Credentials come from .env.local; nothing secret is printed.
import assert from 'node:assert/strict';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { SeshatArticleV1, type SeshatArticle } from '../../lib/studio/schema.ts';
import { checkPublication, publicationState } from '../../lib/publishing/rules.ts';
import { PublishedStoryV1, toPublicSnapshot } from '../../lib/publishing/snapshot.ts';

const env = readEnv() as Record<string, string>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
const editor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
{
  const { error } = await editor.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
}

const RUN = Date.now().toString(36);
const SLUG = `publish-check-${RUN}`;
const results: [string, boolean, string?][] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push([name, true]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push([name, false, (e as Error).message]);
    console.log(`FAIL  ${name}\n      ${(e as Error).message.split('\n')[0]}`);
  }
}

// TEST FIXTURE ONLY (deleted at the end of the run).
function content(headline: string): SeshatArticle {
  const ok = { required: false, reasons: [] as string[] };
  return SeshatArticleV1.parse({
    schemaVersion: 1,
    meta: { workingTitle: `[Publish check] ${headline}`, section: 'markets', author: { name: 'Seshat Editorial', role: 'Editorial team' }, asOf: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    story: { kicker: 'Test', headline, dek: 'Integration test fixture.', keyPoints: ['Fixture.'], blocks: [1, 2, 3].map((n) => ({ type: 'p', text: `Fixture paragraph ${n}.` })), attention: ok },
    macro: { title: 'Macro', intro: 'Fixture.', indicators: [], charts: [], explainers: [{ title: 'Context', text: 'Fixture.', evidence: 'context' }], attention: ok },
    analytics: {
      title: 'Analytics',
      intro: 'Fixture.',
      chain: { title: 'Chain', steps: [{ title: 'A', text: 'A.', evidence: 'interpretation' }, { title: 'B', text: 'B.', evidence: 'interpretation' }] },
      charts: [],
      comparisons: [],
      implications: { title: 'Implications', intro: 'Fixture.', items: [{ asset: 'Bonds', icon: 'bonds', shows: 'Fixture.', showsEvidence: 'context', couldMean: 'Fixture.' }] },
      attention: ok,
    },
    outlook: { title: 'Outlook', intro: 'Fixture.', disclaimer: 'Not a forecast.', scenarios: ['central', 'alternative'].map((role, i) => ({ key: `s${i}`, name: `S${i}`, role, summary: 'Fixture.', conditions: ['C.'], whyItMatters: 'W.', assets: [{ asset: 'Bonds', effect: 'E.' }], watch: ['W.'], uncertainties: ['U.'] })), attention: ok },
    methodology: ['Fixture.'],
    evidence: { citations: [{ ref: 'S1', title: 'Fixture source', url: 'https://example.org/fixture', publisher: 'example.org', sourceType: 'other', publishedAt: null }], findings: [{ ref: 'F1', claim: 'PRIVATE-FINDING-MARKER', kind: 'context', sourceRefs: ['S1'], quoteVerified: false }] },
    data: { facts: {}, dates: {}, charts: {}, indicators: [], sources: [] },
    validation: { checkedAt: new Date().toISOString(), issues: [], claims: [] },
    generation: { jobId: 'PRIVATE-JOB-MARKER', model: 'fixture', searchProvider: 'none', dataProviders: [], generatedAt: new Date().toISOString() },
  });
}

const created: string[] = [];
async function newArticle(headline: string, extra: Record<string, unknown> = {}) {
  const c = content(headline);
  const { data, error } = await editor.from('articles').insert({ working_title: c.meta.workingTitle, brief: { prompt: 'Phase 3A publish-check fixture (deleted after the run).' }, status: 'draft', content: c, revision: 1, ...extra }).select('id').single();
  if (error || !data) throw new Error(`fixture insert: ${error?.message}`);
  created.push(data.id);
  await editor.from('article_revisions').insert({ article_id: data.id, revision: 1, origin: 'editor', content: c, note: 'publish-check fixture' });
  return data.id as string;
}

/** What the server action does: validate the stored revision, project, call the RPC. */
async function publish(db: SupabaseClient, id: string, expected: number, slug: string | null, note?: string) {
  const { data: a } = await editor.from('articles').select('content, is_temporary').eq('id', id).single();
  const check = checkPublication({ content: a!.content, isTemporary: a!.is_temporary, generating: false, today: new Date().toISOString().slice(0, 10) });
  const snapshot = check.article ? toPublicSnapshot(check.article) : { schemaVersion: 1 };
  return db.rpc('publish_article', { p_article: id, p_expected_revision: expected, p_slug: slug, p_snapshot: snapshot, p_note: note ?? null });
}
const row = <T>(d: unknown) => (Array.isArray(d) ? d[0] : d) as T;
type Pub = { outcome: string; slug: string; published_revision: number; published_source_revision: number };

async function editDraft(id: string, revision: number, headline: string) {
  // Same writes as saveDraft(): new editor revision + content update guarded by the expected revision.
  const c = content(headline);
  assert.ok(!(await editor.from('article_revisions').insert({ article_id: id, revision: revision + 1, origin: 'editor', content: c }).then((r) => r.error)));
  const { error } = await editor.from('articles').update({ content: c, revision: revision + 1 }).eq('id', id).eq('revision', revision);
  assert.ifError(error);
}
const live = async (slug: string) => (await anon.from('published_stories').select('slug, revision, snapshot').eq('slug', slug).maybeSingle()).data as { revision: number; snapshot: { story: { headline: string } } } | null;
const articleRow = async (id: string) => (await editor.from('articles').select('revision, content, slug, is_live, first_published_at, last_published_at, published_revision, published_source_revision, updated_at').eq('id', id).single()).data!;

let id = '';
let firstPublishedAt = '';
try {
  id = await newArticle('Publish check headline v1');

  await step('10. anonymous users cannot publish or unpublish', async () => {
    const p = await publish(anon, id, 1, SLUG);
    assert.ok(p.error, 'anon publish must fail');
    const u = await anon.rpc('unpublish_article', { p_article: id });
    assert.ok(u.error, 'anon unpublish must fail');
    assert.equal((await articleRow(id)).is_live, false);
  });

  await step('2. a draft with no content / a temporary draft cannot be published (database guard)', async () => {
    const empty = await newArticle('Empty fixture');
    await admin.from('articles').update({ content: null }).eq('id', empty);
    assert.match((await publish(editor, empty, 1, `${SLUG}-empty`)).error?.message ?? '', /^no_content/);
    const temp = await newArticle('Temporary fixture', { is_temporary: true });
    assert.match((await publish(editor, temp, 1, `${SLUG}-temp`)).error?.message ?? '', /^temporary_draft/);
  });

  await step('1/3. editor publishes a valid draft: snapshot + unique slug, publication 1', async () => {
    const { data, error } = await publish(editor, id, 1, SLUG, 'first edition');
    assert.ifError(error);
    const r = row<Pub>(data);
    assert.deepEqual([r.outcome, r.slug, r.published_revision, r.published_source_revision], ['published', SLUG, 1, 1]);
    const l = await live(SLUG);
    assert.equal(l?.revision, 1);
    assert.equal(PublishedStoryV1.safeParse(l?.snapshot).success, true);
    const s = JSON.stringify(l?.snapshot);
    assert.ok(!s.includes('PRIVATE-FINDING-MARKER') && !s.includes('PRIVATE-JOB-MARKER'), 'public snapshot leaks internal fields');
    const a = await articleRow(id);
    assert.equal(publicationState(a), 'live');
    firstPublishedAt = a.first_published_at!;
  });

  await step('3. duplicate slugs are rejected', async () => {
    const other = await newArticle('Another fixture');
    assert.match((await publish(editor, other, 1, SLUG)).error?.message ?? '', /^slug_taken/);
  });

  await step('4/5. editing the draft leaves the snapshot unchanged and shows unpublished changes', async () => {
    await editDraft(id, 1, 'Publish check headline v2');
    assert.equal((await live(SLUG))?.snapshot.story.headline, 'Publish check headline v1');
    const h = (await editor.from('publication_revisions').select('snapshot').eq('article_id', id).eq('revision', 1).single()).data!;
    assert.equal((h.snapshot as { story: { headline: string } }).story.headline, 'Publish check headline v1');
    assert.equal(publicationState(await articleRow(id)), 'live_changed');
  });

  await step('12. stale or slug-changing publish requests are rejected', async () => {
    assert.match((await publish(editor, id, 1, null)).error?.message ?? '', /^stale_revision/);
    assert.match((await publish(editor, id, 2, 'a-different-slug')).error?.message ?? '', /^slug_mismatch/);
  });

  await step('12. concurrent duplicate republish requests create exactly one publication', async () => {
    const all = await Promise.all(Array.from({ length: 5 }, () => publish(editor, id, 2, null)));
    for (const r of all) assert.ifError(r.error);
    const outcomes = all.map((r) => row<Pub>(r.data).outcome).sort();
    assert.deepEqual(outcomes, ['published', 'unchanged', 'unchanged', 'unchanged', 'unchanged']);
  });

  await step('6/7. republish = publication 2, same URL, earlier revision retained', async () => {
    const a = await articleRow(id);
    assert.deepEqual([a.slug, a.published_revision, a.published_source_revision, publicationState(a)], [SLUG, 2, 2, 'live']);
    assert.equal(a.first_published_at, firstPublishedAt, 'first publication time must not move');
    const l = await live(SLUG);
    assert.deepEqual([l?.revision, l?.snapshot.story.headline], [2, 'Publish check headline v2']);
    const { data: hist } = await editor.from('publication_revisions').select('revision, source_revision, slug, published_by, published_by_name, note').eq('article_id', id).order('revision');
    assert.deepEqual(hist!.map((h) => [h.revision, h.source_revision, h.slug]), [[1, 1, SLUG], [2, 2, SLUG]]);
    assert.ok(hist!.every((h) => h.published_by && h.published_by_name));
  });

  await step('8. unpublish removes public access, keeps draft and history (idempotent)', async () => {
    const both = await Promise.all([editor.rpc('unpublish_article', { p_article: id }), editor.rpc('unpublish_article', { p_article: id })]);
    for (const r of both) assert.ifError(r.error);
    assert.deepEqual(both.map((r) => row<{ outcome: string }>(r.data).outcome).sort(), ['unchanged', 'unpublished']);
    assert.equal(await live(SLUG), null);
    const a = await articleRow(id);
    assert.equal(publicationState(a), 'unpublished');
    assert.ok(a.content, 'working draft kept');
    assert.equal(a.slug, SLUG);
    assert.equal((await editor.from('publication_revisions').select('id').eq('article_id', id)).data?.length, 2);
  });

  await step('11. public access cannot read drafts, history or unpublished stories', async () => {
    for (const t of ['articles', 'article_revisions', 'publication_revisions', 'generation_jobs', 'research_sources', 'research_findings', 'datasets', 'editors', 'api_usage']) {
      const { data, error } = await anon.from(t).select('*').limit(1);
      assert.ok(error || !data?.length, `anon could read ${t}`);
    }
    assert.equal(await live(SLUG), null);
  });

  await step('10. direct writes bypassing the publishing functions are rejected', async () => {
    assert.ok((await editor.from('articles').update({ is_live: true }).eq('id', id)).error, 'editor set is_live directly');
    assert.ok((await editor.from('articles').update({ slug: `${SLUG}-x` }).eq('id', id)).error, 'editor changed slug directly');
    const h = await editor.from('publication_revisions').insert({ article_id: id, revision: 99, source_revision: 1, slug: SLUG, content: {}, snapshot: {}, published_by: id, published_by_name: 'x' });
    assert.ok(h.error, 'editor inserted history directly');
    const u = await editor.from('publication_revisions').update({ note: 'tampered' }).eq('article_id', id).select('id');
    assert.ok(u.error || !u.data?.length, 'editor modified history');
    const p = await editor.from('published_stories').insert({ article_id: id, slug: SLUG, revision: 9, snapshot: {}, first_published_at: new Date().toISOString(), published_at: new Date().toISOString() });
    assert.ok(p.error, 'editor inserted a live story directly');
    const ap = await anon.from('published_stories').insert({ article_id: id, slug: SLUG, revision: 9, snapshot: {}, first_published_at: new Date().toISOString(), published_at: new Date().toISOString() });
    assert.ok(ap.error, 'anon inserted a live story');
    assert.ok((await editor.from('articles').delete().eq('id', id)).error || (await articleRow(id)), 'published article deleted');
  });

  await step('9. a previously unpublished article republishes under the same slug', async () => {
    const before = (await articleRow(id)).updated_at;
    const { data, error } = await publish(editor, id, 2, null, 'restored');
    assert.ifError(error);
    const r = row<Pub>(data);
    assert.deepEqual([r.outcome, r.slug, r.published_revision], ['published', SLUG, 3]);
    assert.equal((await live(SLUG))?.revision, 3);
    const a = await articleRow(id);
    assert.equal(a.first_published_at, firstPublishedAt);
    assert.equal(a.updated_at, before, 'publishing must not touch the draft "updated" time');
  });
} finally {
  // Cleanup (secret key): fixture articles and their publication rows only.
  if (created.length) {
    await admin.from('published_stories').delete().in('article_id', created);
    await admin.from('publication_revisions').delete().in('article_id', created);
    const { error } = await admin.from('articles').delete().in('id', created);
    console.log(error ? `cleanup FAILED: ${error.message} (fixture ids: ${created.join(', ')})` : `cleanup: removed ${created.length} fixture article(s)`);
  }
  await editor.auth.signOut();
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
