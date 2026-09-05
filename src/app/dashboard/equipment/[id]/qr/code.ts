import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getEquipmentPublicUrl, qrFileSlug } from "@/lib/qr";
import type { Equipment, QrCode } from "@/lib/types";

/** Everything the PNG/SVG download routes need, or null when the caller shouldn't see it. */
export type DownloadableCode = {
  publicUrl: string;
  /** "break-room-water-heater-abcd2345" — no extension. */
  fileName: string;
};

/**
 * Loads a unit's active QR code through the RLS-scoped staff client. Anything
 * the signed-in user can't see — another company's unit, a unit with no active
 * code, or no session at all — comes back as null so the route can 404 without
 * leaking which of those it was.
 */
export async function loadDownloadableCode(equipmentId: string): Promise<DownloadableCode | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS scopes both selects to the caller's company, so an id from another
  // tenant simply returns nothing.
  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, name")
    .eq("id", equipmentId)
    .maybeSingle<Pick<Equipment, "id" | "name">>();

  if (!equipment) return null;

  const { data: code } = await supabase
    .from("qr_codes")
    .select("token, short_code")
    .eq("equipment_id", equipmentId)
    .eq("status", "active")
    .maybeSingle<Pick<QrCode, "token" | "short_code">>();

  if (!code) return null;

  return {
    publicUrl: getEquipmentPublicUrl(code.token),
    fileName: qrFileSlug(equipment.name, code.short_code),
  };
}
