import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isVendorDispatchOpen } from "@/lib/public-request";

// Signed-URL redirect for one photo/video on a vendor's work order
// (docs/OWNER-ROADMAP-BRIEF.md §3.3.7). The vendor's browser never sees a
// storage path — get_vendor_dispatch()'s `media` array is index-only — so the
// bucket can't be enumerated from the /v/<token> page; this route is the only
// thing that turns an index back into bytes, and only for the exact
// service_request_media rows that request owns.
//
// It reads the rows with the admin client instead of going through
// get_vendor_dispatch() (that RPC stamps viewed_at, and an <img> load is not a
// "the vendor opened it" signal), so it has to reproduce that RPC's two gates
// itself: the per-dispatch rate limit, and the declined/closed check. Without
// them a leaked token kept fetching photos forever, including from a dispatch
// the owner had already declined or a request they had already closed.

export const runtime = "nodejs";

const SIGNED_URL_TTL_SECONDS = 300;

type EmbeddedRequest = { status: string };

type DispatchRow = {
  id: string;
  status: string;
  service_request_id: string;
  // PostgREST returns a to-one embed as an object, but the client's own types
  // model some embeds as arrays — accept both rather than depend on it.
  service_requests: EmbeddedRequest | EmbeddedRequest[] | null;
};

function embeddedRequestStatus(row: DispatchRow): string | undefined {
  const embedded = row.service_requests;
  if (!embedded) return undefined;
  return Array.isArray(embedded) ? embedded[0]?.status : embedded.status;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; index: string }> }
) {
  const { token, index: indexParam } = await params;
  const index = Number(indexParam);

  // Number() is deliberately strict here: "1e3", " 2" and "0x2" all parse, so
  // the integer/range check below is what actually bounds it.
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await checkRateLimit(
    `vm:tok:${token.slice(0, 200)}`,
    RATE_LIMITS.vendorMediaPerToken
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { data: dispatch } = await admin
    .from("dispatches")
    .select("id, status, service_request_id, service_requests(status)")
    .eq("token", token)
    .maybeSingle<DispatchRow>();

  if (!dispatch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same gate every vendor-token RPC in migration 0025 applies (P0001).
  if (!isVendorDispatchOpen(dispatch.status, embeddedRequestStatus(dispatch))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same ordering get_vendor_dispatch() uses to number the `media` array, so
  // index N here is always the same object N in that payload.
  const { data: media } = await admin
    .from("service_request_media")
    .select("storage_path")
    .eq("service_request_id", dispatch.service_request_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .returns<{ storage_path: string }[]>();

  const items = media ?? [];
  if (index >= items.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signed, error } = await admin.storage
    .from("service-request-media")
    .createSignedUrl(items[index].storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
