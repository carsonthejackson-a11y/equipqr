import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Signed-URL redirect for one photo/video on a vendor's work order
// (docs/OWNER-ROADMAP-BRIEF.md §3.3.7). The vendor's browser never sees a
// storage path — get_vendor_dispatch()'s `media` array is index-only — so the
// bucket can't be enumerated from the /v/<token> page; this route is the only
// thing that turns an index back into bytes, and only for the exact
// service_request_media rows that request owns.

export const runtime = "nodejs";

const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; index: string }> }
) {
  const { token, index: indexParam } = await params;
  const index = Number(indexParam);

  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: dispatch } = await admin
    .from("dispatches")
    .select("service_request_id")
    .eq("token", token)
    .maybeSingle<{ service_request_id: string }>();

  if (!dispatch) {
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
