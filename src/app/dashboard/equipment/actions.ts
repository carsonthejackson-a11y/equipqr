"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createEquipment(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const equipmentTypeId = String(formData.get("equipmentTypeId") ?? "");
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!name || !equipmentTypeId) {
    return { error: "Name and equipment type are required" };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .single();

  if (!profile) {
    return { error: "No company found for this account" };
  }

  const { data, error } = await supabase
    .from("equipment")
    .insert({
      company_id: profile.company_id,
      equipment_type_id: equipmentTypeId,
      name,
      serial_number: serialNumber || null,
      location: location || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment");
  return { id: data.id };
}

export async function updateEquipment(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const equipmentTypeId = String(formData.get("equipmentTypeId") ?? "");
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!name || !equipmentTypeId) {
    return { error: "Name and equipment type are required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment")
    .update({
      name,
      equipment_type_id: equipmentTypeId,
      serial_number: serialNumber || null,
      location: location || null,
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
