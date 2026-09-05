import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";

/**
 * On the production deployment's *.vercel.app URL, bounce to
 * NEXT_PUBLIC_APP_URL's origin so auth cookies, QR links and Stripe redirects
 * all live on one canonical host. Returns null (i.e. no redirect) for preview
 * deployments and local dev/CI, and for requests already on that host.
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  // Preview deployments are *supposed* to be reachable on their own
  // *.vercel.app URL — only the production deployment gets pinned to the
  // canonical host. Unset (local dev, CI, `next start`) counts as not
  // production.
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  if (!request.nextUrl.hostname.endsWith(".vercel.app")) {
    return null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return null;
  }

  let canonical: URL;
  try {
    canonical = new URL(appUrl);
  } catch {
    return null;
  }

  if (canonical.hostname === "localhost" || canonical.hostname === "127.0.0.1") {
    return null;
  }
  if (canonical.hostname === request.nextUrl.hostname) {
    return null;
  }

  return NextResponse.redirect(
    new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, canonical.origin),
    308
  );
}

export async function updateSession(request: NextRequest) {
  const canonical = canonicalHostRedirect(request);
  if (canonical) {
    return canonical;
  }

  // Server Components/layouts can't read the current pathname directly (only
  // Client Components can, via usePathname) — stash it on a request header
  // here so src/app/dashboard/layout.tsx can read it back with headers() to
  // decide whether the billing lock screen applies to the current route.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup";
  const isProtected = path.startsWith("/dashboard");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were headed so logging in lands there instead of
    // dumping everyone on /dashboard. Only for GETs — replaying a POST's
    // target after login isn't something the login form can do anyway.
    if (request.method === "GET") {
      url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(url);
  }

  // A logged-in user hitting /login or /signup with an invite in tow (e.g.
  // "log in with a different account to accept this invite") should reach
  // the form instead of being bounced straight to /dashboard.
  const hasInviteParam =
    request.nextUrl.searchParams.has("invite") || request.nextUrl.searchParams.has("next");

  if (user && isAuthPage && !hasInviteParam) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
