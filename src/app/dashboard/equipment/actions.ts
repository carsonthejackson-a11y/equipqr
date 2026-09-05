"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateInstantToken, normalizeQrCode } from "@/lib/qr";
import { assertCanAddEquipment } from "@/lib/billing";

async function assignCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  equipmentId: string,
  companyId: string,
  formData: FormData
) {
  const codeSource = String(formData.get("codeSource") ?? "instant");

  if (codeSource === "instant") {
    const { error } = await supabase.from("qr_codes").insert({
      token: generateInstantToken(),
      company_id: companyId,
      equipment_id: equipmentId,
      source: "instant",
      claimed_at: new Date().toISOString(),
    });
    return error ? error.message : null;
  }

  if (codeSource === "preprinted") {
    const rawCode = String(formData.get("preprintedCode") ?? "").trim();
    if (!rawCode) {
      return "Enter the code from a pre-printed sticker, or choose to generate one instead";
    }
    const { error } = await supabase.rpc("claim_qr_code", {
      p_token: normalizeQrCode(rawCode),
      p_equipment_id: equipmentId,
    });
    return error ? error.message : null;
  }

  return null;
}

export async function createEquipment(
  formData: FormData
): Promise<{ error: string; id?: undefined; codeError?: undefined } | { id: string; codeError: string | null; error?: undefined }> {
  const name = String(formData.get("name") ?? "").trim();
  const equipmentTypeId = String(formData.get("equipmentTypeId") ?? "");
  const customerId = String(formData.get("customerId") ?? "").trim();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();

  if (!name || !equipmentTypeId) {
    return { error: "Name and equipment type are required" };
  }

  const limitError = await assertCanAddEquipment();
  if (limitError) {
    return limitError;
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
    .maybeSingle();

  if (!profile) {
    return { error: "No company found for this account" };
  }

  const { data, error } = await supabase
    .from("equipment")
    .insert({
      company_id: profile.company_id,
      equipment_type_id: equipmentTypeId,
      customer_id: customerId || null,
      name,
      serial_number: serialNumber || null,
      location: location || null,
      address: address || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  const codeError = await assignCode(supabase, data.id, profile.company_id, formData);

  revalidatePath("/dashboard/equipment");
  return { id: data.id, codeError };
}

export async function updateEquipment(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const equipmentTypeId = String(formData.get("equipmentTypeId") ?? "");
  const customerId = String(formData.get("customerId") ?? "").trim();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactPhone = String(formData.get("contactPhone") ?? "").trim();

  if (!name || !equipmentTypeId) {
    return { error: "Name and equipment type are required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment")
    .update({
      name,
      equipment_type_id: equipmentTypeId,
      customer_id: customerId || null,
      serial_number: serialNumber || null,
      location: location || null,
      address: address || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment");
  revalidatePath(`/dashboard/equipment/${id}`);
  return { success: true };
}

export async function deleteEquipment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("equipment").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment");
  return { success: true };
}

export async function assignQrCode(equipmentId: string, companyId: string, formData: FormData) {
  const supabase = await createClient();
  const codeError = await assignCode(supabase, equipmentId, companyId, formData);

  if (codeError) {
    return { error: codeError };
  }

  revalidatePath(`/dashboard/equipment/${equipmentId}`);
  return { success: true };
}
