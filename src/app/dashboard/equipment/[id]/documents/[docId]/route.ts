import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentDocument } from "@/lib/types";

/** How long a download link stays good. Long enough for a slow connection, short enough not to be a share link. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Download one equipment document.
 *
 * `equipment-files` is a private bucket, so the file is never linked directly.
 * This mints a 60-second signed URL with the caller's own RLS-scoped client —
 * both the row lookup and the storage read fail for anyone outside the owning
 * company — and redirects the browser to it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: document } = await supabase
    .from("equipment_documents")
    .select("*")
    .eq("id", docId)
    .eq("equipment_id", id)
    .maybeSingle<EquipmentDocument>();

  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("equipment-files")
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: document.file_name,
    });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not prepare that download" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
