"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createEquipmentType(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { error: "Name is required" };
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
    .from("equipment_types")
    .insert({ company_id: profile.company_id, name, description: description || null })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment-types");
  return { id: data.id };
}

export async function updateEquipmentType(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { error: "Name is required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_types")
    .update({ name, description: description || null })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment-types");
  revalidatePath(`/dashboard/equipment-types/${id}`);
  return { success: true };
}

export async function deleteEquipmentType(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("equipment_types").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment-types");
  return { success: true };
}

export async function createGuideStep(
  equipmentTypeId: string,
  nextStepNumber: number,
  formData: FormData
) {
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();

  if (!title || !instructions) {
    return { error: "Title and instructions are required" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("guide_steps").insert({
    equipment_type_id: equipmentTypeId,
    step_number: nextStepNumber,
    title,
    instructions,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function updateGuideStep(
  stepId: string,
  equipmentTypeId: string,
  formData: FormData
) {
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();

  if (!title || !instructions) {
    return { error: "Title and instructions are required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("guide_steps")
    .update({ title, instructions })
    .eq("id", stepId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function deleteGuideStep(stepId: string, equipmentTypeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("guide_steps").delete().eq("id", stepId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function moveGuideStep(
  equipmentTypeId: string,
  stepId: string,
  currentStepNumber: number,
  direction: "up" | "down"
) {
  const targetStepNumber =
    direction === "up" ? currentStepNumber - 1 : currentStepNumber + 1;

  const supabase = await createClient();

  const { data: neighbor } = await supabase
    .from("guide_steps")
    .select("id")
    .eq("equipment_type_id", equipmentTypeId)
    .eq("step_number", targetStepNumber)
    .maybeSingle();

  if (!neighbor) {
    return { error: "Already at the edge" };
  }

  // Bump the current step out of the way to avoid the unique (type, step_number) conflict.
  await supabase
    .from("guide_steps")
    .update({ step_number: -1 })
    .eq("id", stepId);

  await supabase
    .from("guide_steps")
    .update({ step_number: currentStepNumber })
    .eq("id", neighbor.id);

  await supabase
    .from("guide_steps")
    .update({ step_number: targetStepNumber })
    .eq("id", stepId);

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}
