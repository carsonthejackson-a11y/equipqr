import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Everything that needs a Supabase session refresh runs through here —
// /dashboard, /login, /signup, /invite, /auth, /onboarding, /admin. Route
// handlers (/api/*), the public QR scan pages (/e/*) and the public request
// status pages (/r/*) build their own Supabase clients per request and never
// read the refreshed cookie, so they're excluded rather than paying for an
// auth round-trip on every hit.
export const config = {
  matcher: [
    "/((?!api/|e/|r/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
