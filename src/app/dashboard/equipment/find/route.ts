import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { qrLookupCandidates } from "@/lib/qr";

// Staff-side "type in a code" lookup:
//   GET /dashboard/equipment/find?code=ABCD-2345
// redirects to that code's unit. Accepts anything a technician might type or
// paste — lower case, missing dash, a legacy 24-hex token, a batch
// "AB3D-9F2K" token, or the whole /e/<token> URL off the sticker.
//
// Deliberately a route handler rather than a server action: the caller is a
// plain GET form (labels/find-code-form.tsx), so it works with no client JS on
// a phone in a boiler room.

const DEFAULT_MISS = "/dashboard/equipment?notfound=1";

// Where a miss may bounce back to. An allowlist, not a startsWith check — a
// redirect target taken from a query string is an open-redirect hole
// otherwise (see safeNext() in src/app/auth/confirm/route.ts).
const RETURN_PATHS = new Set(["/dashboard/equipment/labels"]);

function missUrl(origin: string, from: string | null): string {
  if (from && RETURN_PATHS.has(from)) {
    return `${origin}${from}?notfound=1`;
  }
  return `${origin}${DEFAULT_MISS}`;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const from = request.nextUrl.searchParams.get("from");
  const candidates = qrLookupCandidates(request.nextUrl.searchParams.get("code") ?? "");

  if (candidates.length === 0) {
    return NextResponse.redirect(missUrl(origin, from));
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/dashboard/equipment`);
  }

  // RLS keeps this inside the caller's company, so a code belonging to another
  // tenant simply doesn't come back. qrLookupCandidates() guarantees every
  // value is `[A-Za-z0-9-]`, which is what makes this .or() safe to build by
  // hand.
  const { data: code } = await supabase
    .from("qr_codes")
    .select("equipment_id, status")
    .or(candidates.map((value) => `token.eq.${value},short_code.eq.${value}`).join(","))
    .not("equipment_id", "is", null)
    // 'active' sorts before 'replaced' before 'retired', so a live code always
    // wins over an old one still pointing at the same unit.
    .order("status", { ascending: true })
    .limit(1)
    .maybeSingle<{ equipment_id: string | null; status: string }>();

  if (!code?.equipment_id) {
    return NextResponse.redirect(missUrl(origin, from));
  }

  return NextResponse.redirect(`${origin}/dashboard/equipment/${code.equipment_id}`);
}
