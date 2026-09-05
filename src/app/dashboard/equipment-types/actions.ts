"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { GuideGraphNode } from "@/lib/types";
import { draftTroubleshootingGuide } from "@/lib/anthropic";
import { requireActiveSubscription } from "@/lib/billing";

export async function createEquipmentType(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { error: "Name is required" };
  }

  const lockError = await requireActiveSubscription();
  if (lockError) {
    return { error: lockError.error };
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

  const lockError = await requireActiveSubscription();
  if (lockError) {
    return { error: lockError.error };
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

export async function createGuideStep(equipmentTypeId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const instructions = String(formData.get("instructions") ?? "").trim();
  const isRoot = formData.get("isRoot") === "true";

  if (!title) {
    return { error: "Title is required" };
  }

  const supabase = await createClient();

  if (isRoot) {
    await supabase
      .from("guide_steps")
      .update({ is_root: false })
      .eq("equipment_type_id", equipmentTypeId)
      .eq("is_root", true);
  }

  const { error } = await supabase.from("guide_steps").insert({
    equipment_type_id: equipmentTypeId,
    title,
    instructions: instructions || null,
    is_root: isRoot,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function setRootStep(stepId: string, equipmentTypeId: string) {
  const supabase = await createClient();

  await supabase
    .from("guide_steps")
    .update({ is_root: false })
    .eq("equipment_type_id", equipmentTypeId)
    .eq("is_root", true);

  const { error } = await supabase
    .from("guide_steps")
    .update({ is_root: true })
    .eq("id", stepId);

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
  const isRoot = formData.get("isRoot") === "true";

  if (!title) {
    return { error: "Title is required" };
  }

  const supabase = await createClient();

  if (isRoot) {
    await supabase
      .from("guide_steps")
      .update({ is_root: false })
      .eq("equipment_type_id", equipmentTypeId)
      .eq("is_root", true)
      .neq("id", stepId);
  }

  const { error } = await supabase
    .from("guide_steps")
    .update({ title, instructions: instructions || null, is_root: isRoot })
    .eq("id", stepId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function deleteGuideStep(stepId: string, equipmentTypeId: string) {
  const supabase = await createClient();

  const { data: step } = await supabase
    .from("guide_steps")
    .select("is_root")
    .eq("id", stepId)
    .maybeSingle();

  if (step?.is_root) {
    const { count } = await supabase
      .from("guide_steps")
      .select("id", { count: "exact", head: true })
      .eq("equipment_type_id", equipmentTypeId)
      .neq("id", stepId);

    if ((count ?? 0) > 0) {
      return { error: "Set another step as the start before deleting this one." };
    }
  }

  const { error } = await supabase.from("guide_steps").delete().eq("id", stepId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function createGuideOption(
  stepId: string,
  equipmentTypeId: string,
  formData: FormData
) {
  const label = String(formData.get("label") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "continue");
  const nextStepId = String(formData.get("nextStepId") ?? "").trim();

  if (!label) {
    return { error: "Label is required" };
  }
  if (outcome === "continue" && !nextStepId) {
    return { error: "Choose which step this continues to" };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("guide_options")
    .select("id", { count: "exact", head: true })
    .eq("guide_step_id", stepId);

  const { error } = await supabase.from("guide_options").insert({
    guide_step_id: stepId,
    label,
    outcome,
    next_step_id: outcome === "continue" ? nextStepId : null,
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function updateGuideOption(
  optionId: string,
  equipmentTypeId: string,
  formData: FormData
) {
  const label = String(formData.get("label") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "continue");
  const nextStepId = String(formData.get("nextStepId") ?? "").trim();

  if (!label) {
    return { error: "Label is required" };
  }
  if (outcome === "continue" && !nextStepId) {
    return { error: "Choose which step this continues to" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("guide_options")
    .update({
      label,
      outcome,
      next_step_id: outcome === "continue" ? nextStepId : null,
    })
    .eq("id", optionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

export async function deleteGuideOption(optionId: string, equipmentTypeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("guide_options").delete().eq("id", optionId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

// Shared bulk-insert primitive: replaces an equipment type's entire guide
// graph in one call. Used by the AI-drafted-guide flow's "Use this draft"
// action below.
export async function replaceGuideGraph(equipmentTypeId: string, nodes: GuideGraphNode[]) {
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("guide_steps")
    .delete()
    .eq("equipment_type_id", equipmentTypeId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  // Inserted one at a time (rather than a single bulk insert) so each row's
  // real id can be captured and mapped back to the node's tempId, to resolve
  // next_step_id references when inserting the options below.
  const tempIdToRealId = new Map<string, string>();

  for (const node of nodes) {
    const { data: row, error } = await supabase
      .from("guide_steps")
      .insert({
        equipment_type_id: equipmentTypeId,
        title: node.title,
        instructions: node.instructions,
        is_root: node.isRoot,
      })
      .select("id")
      .single();

    if (error || !row) {
      return { error: error?.message ?? "Failed to insert a step" };
    }
    tempIdToRealId.set(node.tempId, row.id);
  }

  const optionRows = nodes.flatMap((node) =>
    node.options.map((option) => ({
      guide_step_id: tempIdToRealId.get(node.tempId)!,
      label: option.label,
      outcome: option.outcome,
      next_step_id: option.nextTempId ? tempIdToRealId.get(option.nextTempId) ?? null : null,
    }))
  );

  if (optionRows.length > 0) {
    const { error: optionsError } = await supabase.from("guide_options").insert(optionRows);
    if (optionsError) {
      return { error: optionsError.message };
    }
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

// Generates a draft guide graph via AI — does NOT persist anything. The
// caller renders the returned nodes for the owner to review and only calls
// replaceGuideGraph() above if they explicitly accept it.
export async function draftGuideWithAI(
  equipmentTypeId: string,
  formData: FormData
): Promise<{ nodes: GuideGraphNode[] } | { error: string }> {
  const description = String(formData.get("description") ?? "").trim();
  const commonIssues = String(formData.get("commonIssues") ?? "").trim();

  const supabase = await createClient();
  const { data: type } = await supabase
    .from("equipment_types")
    .select("name")
    .eq("id", equipmentTypeId)
    .maybeSingle();

  if (!type) {
    return { error: "Equipment type not found" };
  }

  try {
    const nodes = await draftTroubleshootingGuide({
      equipmentTypeName: type.name,
      description,
      commonIssues,
    });
    return { nodes };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate a draft" };
  }
}
