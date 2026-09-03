import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component: ignore, middleware refreshes the session.
          }
        },
      },
      global: {
        // Next.js dedupes identical fetch calls within a single render (request
        // memoization). Without this, two identical selects in the same request
        // (e.g. re-reading a row right after inserting it) can return a cached,
        // stale response instead of the fresh one.
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
    }
  );
}
