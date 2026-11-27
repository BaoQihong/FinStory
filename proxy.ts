// Proxy (Next 16's middleware): keeps the Supabase session cookie fresh for
// the editorial studio and bounces signed-out visitors to the login page.
// This is an optimistic check only — authorization is enforced by
// requireEditor() in every page/action/route and by RLS in the database.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
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

export const config = { matcher: ['/admin/:path*', '/api/studio/:path*'] };
