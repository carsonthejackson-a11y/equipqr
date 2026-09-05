"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatShortCode } from "@/lib/qr";
import type { QrCode } from "@/lib/types";

// QR code lifecycle for one unit. Every mutation goes through a
// security-definer RPC from migration 0013 (which also writes the
// equipment_events timeline row), so this file's job is to call it with the
// RLS-scoped staff client, translate the Postgres error into a message a
// technician can act on, and revalidate the page.

type ActionResult = { error: string } | { success: true };

function friendlyError(message: string): string {
  if (/Code not found/i.test(message)) {
    return "That code is no longer available. Refresh the page and try again.";
  }
  if (/already has an active QR code/i.test(message)) {
    return "That unit already has an active QR code. Retire or replace it first.";
  }
  if (/Equipment not found/i.test(message)) {
    return "That equipment is no longer available.";
  }
  if (/not linked to any equipment/i.test(message)) {
    return "This code isn't linked to a unit, so there's nothing to replace.";
  }
  return message;
}

function revalidateEquipment(equipmentId: string) {
  revalidatePath(`/dashboard/equipment/${equipmentId}`);
  revalidatePath(`/dashboard/equipment/${equipmentId}/label`);
  revalidatePath("/dashboard/equipment");
  revalidatePath("/dashboard/equipment/labels");
}

/**
 * Issues a fresh code for the unit. The old code stays pointed at the unit
 * with status 'replaced', so a sticker already stuck to the machine keeps
 * resolving — see the "codes never break" guarantee in docs/QR-LABELS.md.
 */
export async function replaceQrCode(
  codeId: string,
  equipmentId: string
): Promise<{ error: string } | { success: true; shortCode: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("replace_qr_code", { p_code_id: codeId });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  // replace_qr_code() is declared `returns qr_codes` (a bare composite, not a
  // setof), so PostgREST hands back a single object — but accept an array too
  // rather than depending on that detail.
  const newCode = (Array.isArray(data) ? data[0] : data) as QrCode | null;
  if (!newCode?.short_code) {
    return { error: "Couldn't issue a new code. Try again." };
  }

  revalidateEquipment(equipmentId);
  return { success: true, shortCode: formatShortCode(newCode.short_code) };
}

/** Takes the code out of service entirely: a scan of the old sticker now shows "contact the company". */
export async function retireQrCode(codeId: string, equipmentId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_qr_code", { p_code_id: codeId });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  revalidateEquipment(equipmentId);
  return { success: true };
}

/** Moves an existing sticker's code to a different unit (sticker went on the wrong machine). */
export async function reassignQrCode(
  codeId: string,
  fromEquipmentId: string,
  toEquipmentId: string
): Promise<ActionResult> {
  if (!toEquipmentId) {
    return { error: "Choose the unit this code should point at." };
  }
  if (toEquipmentId === fromEquipmentId) {
    return { error: "This code is already on that unit." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reassign_qr_code", {
    p_code_id: codeId,
    p_equipment_id: toEquipmentId,
  });

  if (error) {
    return { error: friendlyError(error.message) };
  }

  revalidateEquipment(fromEquipmentId);
  revalidatePath(`/dashboard/equipment/${toEquipmentId}`);
  return { success: true };
}

/**
 * Stamps qr_codes.label_printed_at so the labels page can show which units
 * have never had a sticker printed. Best-effort by design: the print dialog
 * has already opened by the time this resolves, and a failed stamp must never
 * surface as an error the user can't act on.
 */
export async function markLabelPrinted(
  codeIds: string[],
  equipmentId?: string
): Promise<{ success: true }> {
  if (codeIds.length === 0) return { success: true };

  const supabase = await createClient();
  // RLS ("Staff update own company qr codes", migration 0013 §3) scopes this
  // to the caller's company, so an id from another tenant updates nothing.
  const { error } = await supabase
    .from("qr_codes")
    .update({ label_printed_at: new Date().toISOString() })
    .in("id", codeIds);

  if (error) {
    console.error("markLabelPrinted failed:", error.message);
  }

  revalidatePath("/dashboard/equipment/labels");
  if (equipmentId) {
    revalidatePath(`/dashboard/equipment/${equipmentId}`);
  }
  return { success: true };
}
