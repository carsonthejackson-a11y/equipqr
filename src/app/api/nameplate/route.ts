import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimits, RATE_LIMITS } from "@/lib/rate-limit";
import {
  extractNameplate,
  MAX_NAMEPLATE_BASE64_LENGTH,
  type NameplateMediaType,
} from "@/lib/nameplate";

// Runs the Anthropic SDK, which needs Node APIs the Edge runtime doesn't
// have (same reason the guide-chat / service-requests routes stay on Node).
export const runtime = "nodejs";

// Staff-only (a technician standing at the machine during scan-to-onboard),
// so this isn't reachable by the anonymous internet the way the customer
// scan routes are — but it's still a paid Anthropic call per hit, so it's
// still rate-limited per user, same pattern as guide-chat's per-IP limit.

const ALLOWED_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type RequestBody = {
  imageBase64?: unknown;
  mediaType?: unknown;
};

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Nameplate scanning isn't configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle<{ company_id: string }>();

  if (!profile) {
    return NextResponse.json({ error: "No company found for this account" }, { status: 403 });
  }

  // Keyed by user id (through the admin client, like every other rate limit
  // here) rather than IP — a technician on a shared shop wifi shouldn't share
  // a bucket with the rest of the crew.
  const limited = await enforceRateLimits([
    { key: `nameplate:user:${user.id}`, rule: RATE_LIMITS.nameplatePerUser },
  ]);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : null;
  const mediaType = typeof body?.mediaType === "string" ? body.mediaType : null;

  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }
  if (imageBase64.length > MAX_NAMEPLATE_BASE64_LENGTH) {
    return NextResponse.json({ error: "That photo is too large. Try again — it'll be downscaled first." }, { status: 400 });
  }

  try {
    const fields = await extractNameplate({
      base64: imageBase64,
      mediaType: mediaType as NameplateMediaType,
    });
    return NextResponse.json({ fields });
  } catch (error) {
    console.error("extractNameplate failed:", error);
    return NextResponse.json(
      { error: "Couldn't read that nameplate. Try again, or fill it in by hand." },
      { status: 502 }
    );
  }
}
