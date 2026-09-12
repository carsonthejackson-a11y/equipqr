import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { firstIssueMessage, sitePinSchema } from "@/lib/public-request";
import type { SitePinVerifyResult } from "@/lib/types";

// Anon-callable: checks a location's site PIN server-side and hands back an
// opaque, expiring pass. Never echoes the PIN or a length/format hint back —
// verify_site_pin() itself enforces that; this route only adds the per-IP
// rate limit and translates the RPC's errcodes.

let warnedNoServiceRole = false;

/**
 * Prefers the admin client so verify_site_pin() can call check_rate_limit()
 * (service-role only) from inside the definer function regardless of who's
 * asking — but the RPC works fine over the anon client too (SECURITY DEFINER
 * runs as its owner either way), so a missing service-role key degrades to
 * "rate limiting inside the RPC is the only backstop" rather than failing
 * the request outright.
 */
async function verifyClient(): Promise<SupabaseClient> {
  try {
    return createAdminClient();
  } catch {
    if (!warnedNoServiceRole) {
      warnedNoServiceRole = true;
      console.warn("SUPABASE_SERVICE_ROLE_KEY is not configured — /api/site-pin is using the anon client.");
    }
    return createClient();
  }
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ip = getClientIp(request);

  const limited = await enforceRateLimits([{ key: `spn:ip:${ip}`, rule: RATE_LIMITS.sitePinPerIp }]);
  if (limited) return limited;

  const parsed = sitePinSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const supabase = await verifyClient();
  const { data, error } = await supabase.rpc("verify_site_pin", {
    p_qr_token: parsed.data.qrToken,
    p_pin: parsed.data.pin,
  });

  if (error) {
    // 54000 = too many attempts (check_rate_limit inside the RPC).
    const status = error.code === "54000" ? 429 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  const result = data as SitePinVerifyResult;
  return NextResponse.json({ ok: result.ok, pass: result.pass, locationName: result.location_name });
}
