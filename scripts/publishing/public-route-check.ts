// Phase 3B.1 integration check: the public article route over HTTP.
//
// Runs the publication lifecycle on dedicated FIXTURE articles (never the
// real published stories) and checks what an anonymous reader gets from
// /story/[slug] on a running server: status codes, content, cache headers and
// the absence of private fields. Publication writes go through the same
// SECURITY DEFINER functions the studio uses, under the editor's session.
// The secret key is used ONLY to delete the fixtures afterwards.
//
// Usage:
//   npm run build && npx next start -p 3217        (in another terminal)
//   node scripts/publishing/public-route-check.ts [--base http://localhost:3217]
//   node scripts/publishing/public-route-check.ts --base https://financialstoryteller.vercel.app
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
/** The real published article: read-only here, used as the baseline. */
const BASELINE = 'why-your-wallet-feels-broke-even-when-inflation-is-falling';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const editor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
{
  const { error } = await editor.auth.signInWithPassword({ email: env.EDITOR_EMAIL, password: env.EDITOR_PASSWORD });
  if (error) throw new Error(`editor sign-in failed: ${error.message}`);
}

const RUN = Date.now().toString(36);
const SLUG = `route-check-${RUN}`;
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

/** Anonymous GET: no cookies, no auth header. */
async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { 'User-Agent': 'seshat-route-check' } });
  return { status: res.status, cache: res.headers.get('cache-control') ?? '', html: await res.text() };
}
const title = (html: string) => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';

const created: string[] = [];
async function newArticle(headline: string, extra: Record<string, unknown> = {}) {
  const c = content(headline);
  const { data, error } = await editor.from('articles').insert({ working_title: c.meta.workingTitle, brief: { prompt: 'Phase 3B route-check fixture (deleted after the run).' }, status: 'draft', content: c, revision: 1, ...extra }).select('id').single();
  if (error || !data) throw new Error(`fixture insert: ${error?.message}`);
  created.push(data.id);
  await editor.from('article_revisions').insert({ article_id: data.id, revision: 1, origin: 'editor', content: c, note: 'route-check fixture' });
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
  const { error } = await editor.rpc('publish_article', { p_article: id, p_expected_revision: expected, p_slug: slug, p_snapshot: toPublicSnapshot(check.article!), p_note: 'route-check' });
  assert.ifError(error);
}
const noStore = (c: string) => /no-store/.test(c);
// A live page must never be served stale. Locally Next sends no-store; on Vercel the
// partially prerendered shell is CDN-cached with "public, max-age=0, must-revalidate"
// while the story data is streamed per request (freshness is proven by steps D-H).
const fresh = (c: string) => noStore(c) || (/max-age=0/.test(c) && /must-revalidate/.test(c));

console.log(`base ${BASE}`);
try {
  await step('A. the published inflation article loads anonymously at its permanent URL', async () => {
    const r = await get(`/story/${BASELINE}`);
    assert.equal(r.status, 200);
    assert.match(title(r.html), /Why Your Wallet Feels Broke/);
    for (const s of ['The story in 30 seconds', 'Sources &amp; method', 'Illustrative scenarios', 'Prepared with AI assistance']) assert.ok(r.html.includes(s), `missing "${s}"`);
    for (const s of ['Needs editorial attention', 'Draft preview', '/admin/', 'quoteVerified', 'Qwen']) assert.ok(!r.html.includes(s), `leaked "${s}"`);
    assert.ok(fresh(r.cache), `cache-control: ${r.cache}`);
  });

  const id = await newArticle('Route check headline one');

  await step('B. a never-published draft is not reachable (404) by slug or by id', async () => {
    for (const p of [`/story/${SLUG}`, `/story/${id}`]) {
      const r = await get(p);
      assert.equal(r.status, 404, p);
      assert.ok(!r.html.includes('Route check headline one'), `${p} leaked the draft`);
    }
  });

  await step('C. unknown and malformed slugs return 404 and are never cached', async () => {
    for (const p of ['/story/this-story-does-not-exist', '/story/Not_A_Slug', '/story/the-bond-comeback', '/story/%E2%80%A6']) {
      const r = await get(p);
      assert.equal(r.status, 404, p);
      assert.ok(noStore(r.cache), `${p} cache-control: ${r.cache}`);
    }
  });

  await step('D. publishing makes the snapshot public (200) without private draft data', async () => {
    await publish(id, 1, SLUG);
    const r = await get(`/story/${SLUG}`);
    assert.equal(r.status, 200);
    assert.match(title(r.html), /Route check headline one/);
    assert.ok(!r.html.includes('PRIVATE-FINDING-MARKER') && !r.html.includes('PRIVATE-JOB-MARKER'), 'internal fields leaked');
  });

  await step('E. editing the working draft does not change the public article', async () => {
    await edit(id, 1, 'Route check headline TWO');
    const r = await get(`/story/${SLUG}`);
    assert.equal(r.status, 200);
    assert.match(title(r.html), /Route check headline one/);
    assert.ok(!r.html.includes('headline TWO'), 'unpublished edit is visible');
  });

  await step('F. republishing updates public content under the same URL', async () => {
    await publish(id, 2, null);
    const r = await get(`/story/${SLUG}`);
    assert.equal(r.status, 200);
    assert.match(title(r.html), /Route check headline TWO/);
  });

  await step('G. unpublishing removes public access immediately (404, not cached)', async () => {
    const { error } = await editor.rpc('unpublish_article', { p_article: id });
    assert.ifError(error);
    const r = await get(`/story/${SLUG}`);
    assert.equal(r.status, 404);
    assert.ok(!r.html.includes('Route check headline'), 'unpublished content still served');
    assert.ok(noStore(r.cache));
  });

  await step('H. republishing after unpublishing restores the same URL', async () => {
    await publish(id, 2, null);
    assert.equal((await get(`/story/${SLUG}`)).status, 200);
  });

  await step('I. a deleted (never-published) article returns 404', async () => {
    const gone = await newArticle('Route check deleted fixture');
    const { error } = await editor.from('articles').delete().eq('id', gone);
    assert.ifError(error);
    created.splice(created.indexOf(gone), 1);
    assert.equal((await get(`/story/${gone}`)).status, 404);
  });

  await step('J. the baseline article is untouched by this run', async () => {
    const r = await get(`/story/${BASELINE}`);
    assert.equal(r.status, 200);
  });
} finally {
  if (created.length) {
    await admin.from('published_stories').delete().in('article_id', created);
    await admin.from('publication_revisions').delete().in('article_id', created);
    const { error } = await admin.from('articles').delete().in('id', created);
    console.log(error ? `cleanup FAILED: ${error.message} (fixture ids: ${created.join(', ')})` : `cleanup: removed ${created.length} fixture article(s)`);
    for (const id of created) assert.equal((await get(`/story/${SLUG}`)).status, 404, `fixture ${id} still public after cleanup`);
  }
  await editor.auth.signOut();
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
