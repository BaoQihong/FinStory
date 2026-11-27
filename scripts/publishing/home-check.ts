// Phase 3C integration check: the homepage over HTTP.
//
// Runs the publication lifecycle on dedicated FIXTURE articles (never the
// real published stories) and checks what an anonymous reader gets from / on
// a running server: discovery, links, ordering, featuring and its fallback,
// republish, unpublish/removal, and the absence of private fields. Writes go
// through the same SECURITY DEFINER functions the studio uses, under the
// editor's session. The secret key is used ONLY to delete the fixtures. The
// homepage feature in place before the run is restored afterwards.
//
// While it runs, fixture stories are briefly live on whichever server reads
// this Supabase project (they lead the homepage for a few seconds).
//
// Usage:
//   npm run build && npx next start -p 3217        (in another terminal)
//   node scripts/publishing/home-check.ts [--base http://localhost:3217]
// Credentials come from .env.local; nothing secret is printed.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../lib/env-file.mjs';
import { checkPublication } from '../../lib/publishing/rules.ts';
import { toPublicSnapshot } from '../../lib/publishing/snapshot.ts';
import { content } from './fixture.ts';

const env = readEnv() as Record<string, string>;
const args = process.argv.slice(2);
const baseAt = args.indexOf('--base');
const BASE = (baseAt >= 0 && args[baseAt + 1] ? args[baseAt + 1] : 'http://localhost:3217').replace(/\/$/, '');
/** The real published article: read-only here. */
const BASELINE = 'why-your-wallet-feels-broke-even-when-inflation-is-falling';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const editor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
{
  const { error } = await editor.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
}

const RUN = Date.now().toString(36);
const results: [string, boolean][] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push([name, true]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`FAIL  ${name}\n      ${(e as Error).message.split('\n')[0]}`);
  }
}

/** Anonymous GET of the homepage: no cookies, no auth header. */
async function home(query = '') {
  const res = await fetch(`${BASE}/${query}`, { redirect: 'manual', headers: { 'User-Agent': 'seshat-home-check' } });
  const html = await res.text();
  const featuredAt = html.indexOf('id="featured-headline"');
  const latestAt = html.indexOf('id="latest-heading"');
  return {
    status: res.status,
    cache: res.headers.get('cache-control') ?? '',
    html,
    featured: featuredAt >= 0 ? html.slice(featuredAt, html.indexOf('</section>', featuredAt)) : '',
    latest: latestAt >= 0 ? html.slice(latestAt, html.indexOf('</section>', latestAt)) : '',
  };
}
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const created: string[] = [];
async function newArticle(headline: string) {
  const c = content(headline);
  const { data, error } = await editor.from('articles').insert({ working_title: c.meta.workingTitle, brief: { prompt: 'Phase 3C home-check fixture (deleted after the run).' }, status: 'draft', content: c, revision: 1 }).select('id').single();
  if (error || !data) throw new Error(`fixture insert: ${error?.message}`);
  created.push(data.id);
  await editor.from('article_revisions').insert({ article_id: data.id, revision: 1, origin: 'editor', content: c, note: 'home-check fixture' });
  return data.id as string;
}
async function edit(id: string, revision: number, headline: string) {
  const c = content(headline);
  await editor.from('article_revisions').insert({ article_id: id, revision: revision + 1, origin: 'editor', content: c });
  const { error } = await editor.from('articles').update({ content: c, revision: revision + 1 }).eq('id', id).eq('revision', revision);
  assert.ifError(error);
}
async function publish(id: string, expected: number, slug: string | null) {
  const { data: a } = await editor.from('articles').select('content, is_temporary').eq('id', id).single();
  const check = checkPublication({ content: a!.content, isTemporary: a!.is_temporary, generating: false, today: new Date().toISOString().slice(0, 10) });
  assert.ok(check.ok && check.article, `fixture not publishable: ${check.blocking.map((b) => b.message).join('; ')}`);
  const { error } = await editor.rpc('publish_article', { p_article: id, p_expected_revision: expected, p_slug: slug, p_snapshot: toPublicSnapshot(check.article!), p_note: 'home-check' });
  assert.ifError(error);
}
async function featuredId() {
  const { data, error } = await anon.from('homepage_feature').select('article_id').maybeSingle();
  assert.ifError(error);
  return (data?.article_id as string | null) ?? null;
}

const H1 = `Home check story one ${RUN}`;
const H1b = `Home check story one revised ${RUN}`;
const H2 = `Home check story two ${RUN}`;
const H3 = `Home check unpublished draft ${RUN}`;
const S1 = `home-check-one-${RUN}`;
const S2 = `home-check-two-${RUN}`;

const priorFeature = await featuredId();
console.log(`base ${BASE} · feature before run: ${priorFeature ? 'set' : 'none'}`);
try {
  await step('A. the published inflation article is discoverable from the homepage', async () => {
    const r = await home();
    assert.equal(r.status, 200);
    assert.ok(r.html.includes(`href="/story/${BASELINE}"`), 'no link to the live article');
    assert.match(r.html, /Why Your Wallet Feels Broke/);
    assert.ok(/no-store/.test(r.cache), `cache-control: ${r.cache}`);
    for (const s of ['/stories/the-bond-comeback', 'In preparation', '/section/']) assert.ok(!r.html.includes(s), `prototype content listed: ${s}`);
  });

  const id1 = await newArticle(H1);
  const id2 = await newArticle(H2);
  const id3 = await newArticle(H3);

  await step('B. working drafts never appear on the homepage', async () => {
    const r = await home();
    for (const h of [H1, H2, H3]) assert.ok(!r.html.includes(h), `draft "${h}" is visible`);
  });

  await step('C. a newly published article appears automatically, linked to /story/[slug], without private data', async () => {
    await publish(id1, 1, S1);
    const r = await home();
    assert.ok(r.html.includes(H1), 'new story missing');
    assert.ok(r.html.includes(`href="/story/${S1}"`), 'wrong or missing link');
    for (const leak of ['PRIVATE-FINDING-MARKER', 'PRIVATE-JOB-MARKER', '[Publish check]', 'home-check fixture', '/admin/', 'Qwen', 'Needs editorial attention']) assert.ok(!r.html.includes(leak), `leaked "${leak}"`);
  });

  await step('D. stories are ordered newest first; with nothing featured the newest leads', async () => {
    await publish(id2, 1, S2);
    const r = await home();
    if (priorFeature === null) {
      assert.ok(r.featured.includes(H2), 'newest story is not the lead');
      assert.ok(r.latest.indexOf(H1) >= 0 && r.latest.indexOf(H1) < r.latest.indexOf('Why Your Wallet Feels Broke'), 'latest list not newest first');
    } else {
      assert.ok(r.latest.indexOf(H2) < r.latest.indexOf(H1), 'latest list not newest first');
    }
  });

  await step('E. featuring a story leads with it and does not repeat it in the latest list', async () => {
    const { error } = await editor.rpc('set_featured_article', { p_article: id1 });
    assert.ifError(error);
    assert.equal(await featuredId(), id1);
    const r = await home();
    assert.ok(r.featured.includes(H1), 'featured story is not the lead');
    assert.ok(!r.latest.includes(H1), 'featured story repeated in latest stories');
    assert.equal(count(r.html, `href="/story/${S1}"`), 2, 'featured story should be linked twice (headline + button) and nowhere else');
    assert.ok(r.latest.includes(H2), 'other stories missing from the latest list');
  });

  await step('F. only live articles can be featured, and only by an editor', async () => {
    const notLive = await editor.rpc('set_featured_article', { p_article: id3 });
    assert.match(notLive.error?.message ?? '', /not_live/);
    const viaAnon = await anon.rpc('set_featured_article', { p_article: id2 });
    assert.ok(viaAnon.error, 'anon could call set_featured_article');
    await anon.from('homepage_feature').update({ article_id: id2 }).eq('id', true);
    await anon.from('homepage_feature').insert({ id: true, article_id: id2 });
    assert.equal(await featuredId(), id1, 'anon changed the feature');
    const who = await anon.from('homepage_feature').select('updated_by');
    assert.ok(who.error, 'anon can read who set the feature (updated_by)');
  });

  await step('G. draft edits stay private; republishing updates the homepage in place', async () => {
    await edit(id1, 1, H1b);
    let r = await home();
    assert.ok(r.featured.includes(H1) && !r.html.includes(H1b), 'unpublished edit is visible');
    await publish(id1, 2, null);
    r = await home();
    assert.ok(r.featured.includes(H1b), 'republished headline not shown');
    assert.ok(r.featured.includes(`href="/story/${S1}"`), 'URL changed on republish');
    assert.equal(await featuredId(), id1, 'republish cleared the feature');
  });

  await step('H. unpublishing the featured story removes it and falls back automatically', async () => {
    const { error } = await editor.rpc('unpublish_article', { p_article: id1 });
    assert.ifError(error);
    assert.equal(await featuredId(), null, 'feature not cleared on unpublish');
    const r = await home();
    assert.ok(!r.html.includes(H1b) && !r.html.includes(`/story/${S1}`), 'unpublished story still listed');
    assert.ok(r.featured.length > 0, 'no lead story after fallback');
    if (priorFeature === null) assert.ok(r.featured.includes(H2), 'fallback is not the newest live story');
  });

  await step('I. a removed (deleted) article disappears from the homepage', async () => {
    const { error } = await editor.rpc('unpublish_article', { p_article: id2 });
    assert.ifError(error);
    await admin.from('publication_revisions').delete().eq('article_id', id2);
    const del = await admin.from('articles').delete().eq('id', id2);
    assert.ifError(del.error);
    created.splice(created.indexOf(id2), 1);
    const r = await home();
    assert.ok(!r.html.includes(H2) && !r.html.includes(`/story/${S2}`), 'deleted story still listed');
  });

  await step('J. malformed and out-of-range pages render the front page', async () => {
    for (const q of ['?page=abc', '?page=999', '?page=0']) {
      const r = await home(q);
      assert.equal(r.status, 200, q);
      assert.ok(r.html.includes(`href="/story/${BASELINE}"`), `${q}: live article missing`);
    }
  });
} finally {
  // Restore the editor's prior choice (if that article is still live).
  const restore = await editor.rpc('set_featured_article', { p_article: priorFeature });
  if (restore.error) await editor.rpc('set_featured_article', { p_article: null });
  if (created.length) {
    await admin.from('published_stories').delete().in('article_id', created);
    await admin.from('publication_revisions').delete().in('article_id', created);
    const { error } = await admin.from('articles').delete().in('id', created);
    console.log(error ? `cleanup FAILED: ${error.message} (fixture ids: ${created.join(', ')})` : `cleanup: removed ${created.length} fixture article(s)`);
  }
  console.log(`feature after run: ${(await featuredId()) === priorFeature ? 'restored' : 'NOT restored'}`);
  const r = await home();
  assert.ok(!r.html.includes(RUN), 'fixture content still on the homepage after cleanup');
  await editor.auth.signOut();
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
