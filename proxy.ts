// Proxy (Next 16's middleware): keeps the Supabase session cookie fresh for
// the editorial studio and bounces signed-out visitors to the login page.
// This is an optimistic check only — authorization is enforced by
// requireEditor() in every page/action/route and by RLS in the database.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public story pages (Phase 3B.1, D-047): with Cache Components the page
// streams its shell before it can call notFound(), which would answer a
// missing story with HTTP 200. A slug-only existence check here lets unknown,
// unpublished and deleted stories return a real 404. It reads nothing but the
// slug column of the anon-readable live table, and fails open (the page then
// decides) if the lookup itself errors.
const STORY_PATH = /^\/story\/([^/]+)\/?$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function storyIsLive(slug: string): Promise<boolean | null> {
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/published_stories?select=slug&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const res = await fetch(url, { headers: { apikey: key, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return ((await res.json()) as unknown[]).length > 0;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const story = STORY_PATH.exec(request.nextUrl.pathname);
  if (story) {
    const slug = story[1];
    const live = SLUG.test(slug) && slug.length <= 80 ? await storyIsLive(slug) : false;
    if (live === false) {
      // Never let a CDN keep the 404: the slug may be published (or republished) later.
      const res = NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
      res.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      return res;
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const signedIn = !!data?.claims?.sub;
  if (!signedIn && path.startsWith('/admin') && path !== '/admin/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (!signedIn && path.startsWith('/api/studio')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/admin/:path*', '/api/studio/:path*', '/story/:path*'] };
