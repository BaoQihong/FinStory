// Server-side Supabase client bound to the request's auth cookies. Uses the
// publishable key + the editor's session, so Row Level Security is always
// enforced; no service-role key is used by the application at runtime.
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component render — the proxy refreshes cookies instead.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof supabaseServer>>;
