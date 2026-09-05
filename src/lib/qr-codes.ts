import type { SupabaseClient } from "@supabase/supabase-js";
import { generateShortCode } from "@/lib/qr";

/** How many times to retry a short-code insert before giving up on collisions. */
const CODE_ATTEMPTS = 3;

/**
 * Creates and claims a brand-new instant QR code for a unit.
 *
 * New codes use the 8-char short code as the URL token too (see src/lib/qr.ts).
 * Uniqueness is a DB constraint, so on the (rare) collision — Postgres error
 * 23505 — we simply draw another code and try again. Any other error is real
 * and returned immediately.
 *
 * Returns null on success, or an error message. Shared by the "assign a code"
 * form, new-equipment creation and the CSV importer so every path produces
 * identical rows.
 */
export async function createInstantCode(
  supabase: SupabaseClient,
  equipmentId: string,
  companyId: string
): Promise<string | null> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const shortCode = generateShortCode();
    const { error } = await supabase.from("qr_codes").insert({
      token: shortCode,
      short_code: shortCode,
      company_id: companyId,
      equipment_id: equipmentId,
      source: "instant",
      status: "active",
      claimed_at: new Date().toISOString(),
    });

    if (!error) return null;

    lastError = error.message;
    if (error.code !== "23505") break; // not a unique violation — retrying won't help
  }

  return lastError;
}
