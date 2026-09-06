"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { generateChecklistDraft } from "@/lib/anthropic";
import { checklistItemsSchema, newItemId } from "@/lib/checklists";
import { serverEnv } from "@/lib/env";
import type { ChecklistItem } from "@/lib/types";

function parseItems(raw: string): { items: ChecklistItem[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Couldn't read the checklist items" };
  }
  const result = checklistItemsSchema.safeParse(parsed);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Invalid checklist items" };
  }
  return { items: result.data };
}

export async function createChecklistTemplate(
  formData: FormData
): Promise<{ error: string; id?: undefined } | { id: string; error?: undefined }> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const equipmentTypeId = String(formData.get("equipmentTypeId") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (!name) {
    return { error: "Name is required" };
  }

  const parsedItems = parseItems(itemsRaw);
  if ("error" in parsedItems) {
    return parsedItems;
  }

  const { profile } = await getCurrentProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({
      company_id: profile.company_id,
      equipment_type_id: equipmentTypeId || null,
      name,
      description: description || null,
      items: parsedItems.items,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/checklists");
  return { id: data.id };
}

export async function updateChecklistTemplate(
  id: string,
  formData: FormData
): Promise<{ error: string; success?: undefined } | { success: true; error?: undefined }> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const equipmentTypeId = String(formData.get("equipmentTypeId") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (!name) {
    return { error: "Name is required" };
  }

  const parsedItems = parseItems(itemsRaw);
  if ("error" in parsedItems) {
    return parsedItems;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_templates")
    .update({
      name,
      description: description || null,
      equipment_type_id: equipmentTypeId || null,
      items: parsedItems.items,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/checklists");
  revalidatePath(`/dashboard/checklists/${id}`);
  return { success: true };
}

/** Any staff member can deactivate a checklist (retire it without losing history); only owners delete outright. */
export async function setChecklistTemplateActive(
  id: string,
  active: boolean
): Promise<{ error: string; success?: undefined } | { success: true; error?: undefined }> {
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_templates").update({ active }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/checklists");
  revalidatePath(`/dashboard/checklists/${id}`);
  return { success: true };
}

export async function deleteChecklistTemplate(id: string) {
  const { profile } = await getCurrentProfile();
  if (profile.role !== "owner") {
    return { error: "Only owners can delete checklist templates. Deactivate it instead." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("checklist_templates").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/checklists");
  redirect("/dashboard/checklists");
}

/**
 * Drafts checklist items with AI — does NOT persist anything. Gated the same
 * way the customer-facing AI assistant is (ANTHROPIC_API_KEY configured +
 * the company's plan includes `aiChat`), since this is the same Anthropic
 * spend on a staff-only surface. Assigns real ids via newItemId() so the
 * editor can treat the result exactly like any other ChecklistItem[].
 */
export async function generateChecklistDraftAction(
  formData: FormData
): Promise<{ items: ChecklistItem[] } | { error: string }> {
  const equipmentTypeName = String(formData.get("equipmentTypeName") ?? "").trim() || "General equipment";
  const equipmentTypeDescription = String(formData.get("equipmentTypeDescription") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();

  if (!serverEnv.ANTHROPIC_API_KEY) {
    return { error: "AI drafting isn't configured for this environment" };
  }

  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "aiChat")) {
    return { error: "AI drafting isn't available on your plan. Upgrade to Pro to use it." };
  }

  try {
    const draftItems = await generateChecklistDraft({
      equipmentTypeName,
      equipmentTypeDescription,
      purpose,
    });
    return { items: draftItems.map((item) => ({ ...item, id: newItemId() })) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate a draft" };
  }
}
