"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertCanAddEquipment } from "@/lib/billing";
import { emitEquipmentEvent } from "@/lib/events";
import { nameplateToEquipmentDraft, type NameplateFields } from "@/lib/nameplate";

export async function claimCode(token: string, equipmentId: string) {
  if (!equipmentId) {
    return { error: "Select which equipment this is" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_qr_code", {
    p_token: token,
    p_equipment_id: equipmentId,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function nullable(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/**
 * Scan-to-onboard (./onboard/onboard-flow.tsx): creates a brand-new unit from
 * the nameplate-prefilled (or hand-filled) form and claims this still-unclaimed
 * sticker to it in one step, then lands back on the staff scan view. Staff-only
 * — ./onboard/page.tsx already checked the caller is signed in as a member of
 * this code's company before rendering the form that posts here, but every
 * check is repeated here too since a server action is directly callable.
 */
export async function onboardEquipment(
  token: string,
  formData: FormData
): Promise<{ error: string } | undefined> {
  const name = text(formData, "name");
  const equipmentTypeId = text(formData, "equipmentTypeId");
  if (!name || !equipmentTypeId) {
    return { error: "Name and equipment type are required" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle<{ company_id: string }>();
  if (!profile) {
    return { error: "No company found for this account" };
  }

  const limitError = await assertCanAddEquipment();
  if (limitError) {
    return limitError;
  }

  // `equipment` RLS only checks company_id, and neither foreign key is
  // constrained to the same tenant — so these ids off the wire have to be
  // proven to be ours. A foreign equipment_type_id would be the worst of the
  // two: resolve_qr_code() is security definer and returns the type's name,
  // description and its whole guide graph to anyone scanning this sticker.
  // These lookups run under RLS, so another company's id simply doesn't come back.
  const { data: ownType } = await supabase
    .from("equipment_types")
    .select("id")
    .eq("id", equipmentTypeId)
    .maybeSingle<{ id: string }>();
  if (!ownType) {
    return { error: "Pick an equipment type from the list" };
  }

  const customerId = nullable(formData, "customerId");
  if (customerId) {
    const { data: ownCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .maybeSingle<{ id: string }>();
    if (!ownCustomer) {
      return { error: "Pick a customer from the list" };
    }
  }

  const nameplateFields: NameplateFields = {
    make: nullable(formData, "make"),
    model: nullable(formData, "model"),
    serial_number: nullable(formData, "serialNumber"),
    voltage: nullable(formData, "voltage"),
    year: nullable(formData, "year"),
    other_notes: nullable(formData, "otherNotes"),
    confidence: "normal",
  };
  const draft = nameplateToEquipmentDraft(nameplateFields);

  const { data: equipment, error: insertError } = await supabase
    .from("equipment")
    .insert({
      company_id: profile.company_id,
      equipment_type_id: equipmentTypeId,
      customer_id: customerId,
      name,
      make: nullable(formData, "make"),
      model: nullable(formData, "model"),
      serial_number: nullable(formData, "serialNumber"),
      location: nullable(formData, "location"),
      custom_fields: draft.customFields ?? {},
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) {
    return { error: insertError.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: profile.company_id,
    equipmentId: equipment.id,
    kind: "equipment_created",
    summary: `Equipment added: ${name}`,
    details: { source: "scan_onboard" },
    actorUserId: user.id,
  });

  const { error: claimError } = await supabase.rpc("claim_qr_code", {
    p_token: token,
    p_equipment_id: equipment.id,
  });

  if (claimError) {
    // The unit exists (and shows up in the dashboard) even though the sticker
    // didn't get linked to it — say so plainly rather than losing the work.
    return {
      error: `Equipment created, but couldn't link this sticker: ${claimError.message}. Assign it a code from the equipment page instead.`,
    };
  }

  redirect(`/e/${token}`);
}
