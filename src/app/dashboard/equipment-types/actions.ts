"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { GuideGraphNode } from "@/lib/types";
import { draftTroubleshootingGuide, guideGraphSchema } from "@/lib/anthropic";
import { getEntitlements, hasFeature, requireActiveSubscription } from "@/lib/billing";
import { getCurrentProfile, requireOwner } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { RATE_LIMITS, checkRateLimit } from "@/lib/rate-limit";
import { upgradeCopyFor } from "@/lib/plans";

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

const MAX_SYMPTOM_CHIP_LENGTH = 40;

/** `symptomChips` arrives as a JSON-stringified array (edit-type-form.tsx) — absent entirely on the create form, which never touches this column. */
function parseSymptomChips(formData: FormData): string[] | undefined {
  const raw = formData.get("symptomChips");
  if (typeof raw !== "string") return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;

  return parsed
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.length <= MAX_SYMPTOM_CHIP_LENGTH)
    .slice(0, 40);
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

  const symptomChips = parseSymptomChips(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment_types")
    .update({
      name,
      description: description || null,
      ...(symptomChips !== undefined ? { symptom_chips: symptomChips } : {}),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment-types");
  revalidatePath(`/dashboard/equipment-types/${id}`);
  return { success: true };
}

export async function deleteEquipmentType(id: string) {
  // Authorization and the "still in use" check come BEFORE anything
  // destructive: the guide_options cleanup below must not run for a
  // non-owner, or for a type whose delete is about to be refused anyway.
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only owners can delete equipment types." };
  }

  const supabase = await createClient();

  // equipment.equipment_type_id is `on delete restrict` — check up front so
  // the refusal is a clean message rather than an FK error after the guide
  // options are already gone.
  const { count: inUse, error: countError } = await supabase
    .from("equipment")
    .select("id", { count: "exact", head: true })
    .eq("equipment_type_id", id);
  if (countError) {
    return { error: countError.message };
  }
  if ((inUse ?? 0) > 0) {
    return { error: "This type is still assigned to equipment. Reassign or delete that equipment first." };
  }

  // Guide steps cascade from the type, but guide_options.next_step_id is
  // `on delete set null` and guide_options_continue_needs_target forbids a
  // 'continue' with no target — so the cascade fails on any option that
  // points at one of this type's steps unless the options go first.
  // (Migration 0029's BEFORE DELETE trigger on guide_steps covers this too,
  // but not every DB has it applied.)
  const { data: steps, error: stepsError } = await supabase
    .from("guide_steps")
    .select("id")
    .eq("equipment_type_id", id)
    .returns<{ id: string }[]>();
  if (stepsError) {
    return { error: stepsError.message };
  }
  const stepIds = (steps ?? []).map((s) => s.id);
  if (stepIds.length > 0) {
    const { error: optionsError } = await supabase.from("guide_options").delete().in("guide_step_id", stepIds);
    if (optionsError) {
      return { error: optionsError.message };
    }
  }

  // RLS ("Owners delete own equipment types") blocks a delete it doesn't
  // allow by silently filtering the row, not by erroring, so the delete
  // would otherwise look like it worked. Chaining .select("id") reports
  // which rows the delete actually touched, so a 0-row result can be turned
  // into an explicit error instead of a silent no-op (C1-38).
  const { data, error } = await supabase.from("equipment_types").delete().eq("id", id).select("id");

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: "Only owners can delete equipment types." };
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
  // guide_steps' own RLS policy ("Staff manage own guide steps") is scoped
  // only to company membership, not ownership — any staff member can
  // already delete through it, so unlike deleteEquipmentType() above there's
  // no row-count trick available here. Gate explicitly instead (C1-38).
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can delete guide steps." };
  }

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

  // Options that continue to this step: guide_options.next_step_id is
  // `on delete set null`, but guide_options_continue_needs_target forbids a
  // 'continue' with no target, so the delete fails at the DB unless they're
  // repointed first. Escalate is the one always-safe terminal outcome; the
  // editor's confirm copy tells the owner to give them a new target.
  // (Migration 0029's BEFORE DELETE trigger does the same, but not every DB
  // has it applied.)
  const { error: repointError } = await supabase
    .from("guide_options")
    .update({ outcome: "escalate", next_step_id: null })
    .eq("next_step_id", stepId);
  if (repointError) {
    return { error: repointError.message };
  }

  const { error } = await supabase.from("guide_steps").delete().eq("id", stepId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/equipment-types/${equipmentTypeId}`);
  return { success: true };
}

// A 'continue' option may only target another step of the same guide.
// Nothing at the DB level says so — next_step_id is a plain FK to
// guide_steps, and the guide_options RLS policy only checks the option's own
// step — so a crafted call could point an option at a step of a different
// type (even another company's) and the public guide would show a dead tap.
// Both the source step and the target must be visible AND belong to
// `equipmentTypeId`, and the target can't be the source itself. Returns the
// error message (the callers wrap it in a fresh `{ error }` literal — keeping
// every return an object literal is what lets the editor read `result?.error`
// off the action's inferred union).
async function continueTargetError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { stepId, equipmentTypeId, nextStepId }: { stepId: string; equipmentTypeId: string; nextStepId: string }
): Promise<string | null> {
  if (nextStepId === stepId) {
    return "An option can't continue to its own step";
  }

  const { data: steps } = await supabase
    .from("guide_steps")
    .select("id")
    .eq("equipment_type_id", equipmentTypeId)
    .in("id", [stepId, nextStepId])
    .returns<{ id: string }[]>();

  if ((steps ?? []).length !== 2) {
    return "Choose a step from this guide";
  }
  return null;
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

  if (outcome === "continue") {
    const targetError = await continueTargetError(supabase, { stepId, equipmentTypeId, nextStepId });
    if (targetError) {
      return { error: targetError };
    }
  }

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

  if (outcome === "continue") {
    const { data: option } = await supabase
      .from("guide_options")
      .select("guide_step_id")
      .eq("id", optionId)
      .maybeSingle<{ guide_step_id: string }>();
    if (!option) {
      return { error: "Option not found" };
    }
    const targetError = await continueTargetError(supabase, {
      stepId: option.guide_step_id,
      equipmentTypeId,
      nextStepId,
    });
    if (targetError) {
      return { error: targetError };
    }
  }

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
  // Same reasoning as deleteGuideStep() above — guide_options' RLS policy
  // isn't owner-restricted, so this needs an explicit check (C1-38).
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can delete guide options." };
  }

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
  // `nodes` is client input. Validate it in full BEFORE the first write:
  // this deletes the live guide and then inserts step by step, so a graph
  // that only fails a DB constraint mid-way (a second root, a 'continue'
  // with no target) used to leave the type with half a guide and a raw
  // Postgres error.
  const parsed = guideGraphSchema.safeParse(nodes);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the draft and try again" };
  }
  const graph = parsed.data;

  // Replacing a guide deletes every existing step, and deleting steps is an
  // owner-only action (C1-38, see deleteGuideStep) — so this is too.
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only owners can replace a troubleshooting guide." };
  }

  const supabase = await createClient();

  // guide_options.next_step_id is `on delete set null`, but
  // guide_options_continue_needs_target forbids a 'continue' with no target
  // — so deleting the old steps fails on any option pointing at one of them
  // unless the options go first. (Migration 0029's BEFORE DELETE trigger
  // covers this too, but not every DB has it applied.)
  const { data: existingSteps, error: existingStepsError } = await supabase
    .from("guide_steps")
    .select("id")
    .eq("equipment_type_id", equipmentTypeId)
    .returns<{ id: string }[]>();
  if (existingStepsError) {
    return { error: existingStepsError.message };
  }
  const existingStepIds = (existingSteps ?? []).map((s) => s.id);
  if (existingStepIds.length > 0) {
    const { error: optionsDeleteError } = await supabase
      .from("guide_options")
      .delete()
      .in("guide_step_id", existingStepIds);
    if (optionsDeleteError) {
      return { error: optionsDeleteError.message };
    }
  }

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

  for (const node of graph) {
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

  const optionRows = graph.flatMap((node) =>
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
//
// Gated the same way generateChecklistDraftAction() (checklists/actions.ts)
// is — same Anthropic cost, and until this pass it was the only staff AI
// surface with no plan, lock or rate-limit check at all (C1-37). Whether
// owner-kind Free should get an aiChat exception is a separate, still-open
// product decision (C1-37's "AI on Free") — this only makes the mechanical
// gating consistent with checklist AI's.
export async function draftGuideWithAI(
  equipmentTypeId: string,
  formData: FormData
): Promise<{ nodes: GuideGraphNode[] } | { error: string }> {
  const description = String(formData.get("description") ?? "").trim();
  const commonIssues = String(formData.get("commonIssues") ?? "").trim();

  if (!serverEnv.ANTHROPIC_API_KEY) {
    return { error: "AI drafting isn't configured for this environment" };
  }

  const lockError = await requireActiveSubscription();
  if (lockError) {
    return { error: lockError.error };
  }

  const { company } = await getCurrentProfile();

  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "aiChat")) {
    // Names this account's OWN kind's plans, never a plan it could never buy (C1-06).
    return {
      error: `AI drafting isn't available on your plan. ${upgradeCopyFor(company.kind, "aiChat") ?? "Upgrade your plan"} to use it.`,
    };
  }

  const withinLimit = await checkRateLimit(`guide-draft:company:${company.id}`, RATE_LIMITS.aiDraftPerCompany);
  if (!withinLimit) {
    return { error: "Too many AI drafts recently — please wait a bit and try again." };
  }

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
