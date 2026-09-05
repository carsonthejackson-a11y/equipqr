import type { SupabaseClient } from "@supabase/supabase-js";
import { generateShortCode } from "@/lib/short-code";
import type { QrCodeStatus } from "@/lib/types";

/**
 * How much we'd rather redirect through a given code, highest wins. A live
 * sticker always beats a superseded one, which beats a decommissioned one.
 * Anything unrecognised sorts last rather than crashing the lookup.
 */
const CODE_STATUS_PREFERENCE: Record<QrCodeStatus, number> = {
  active: 3,
  replaced: 2,
  retired: 1,
};

/**
 * Picks the code a staff "type in a code" lookup should follow when several
 * rows match what was typed — e.g. a unit whose sticker was replaced still
 * has the old `replaced` row pointing at it alongside the new `active` one.
 *
 * Pure and explicit on purpose. This used to be `.order("status").limit(1)`,
 * which worked only because 'active' < 'replaced' < 'retired' happens to be
 * alphabetical: renaming or adding a status would have silently started
 * sending technicians to a dead code.
 */
export function pickBestCode<T extends { status: string; equipment_id: string | null }>(
  rows: readonly T[]
): T | null {
  let best: T | null = null;
  let bestRank = -1;

  for (const row of rows) {
    if (!row.equipment_id) continue;
    const rank = CODE_STATUS_PREFERENCE[row.status as QrCodeStatus] ?? 0;
    if (rank > bestRank) {
      best = row;
      bestRank = rank;
    }
  }

  return best;
}

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
