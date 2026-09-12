"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import { RESTAURANT_EQUIPMENT_TEMPLATES } from "@/lib/owner-templates";
import { createLocation } from "../../locations/actions";

/**
 * Step 1 of the owner first-run wizard (docs/OWNER-ROADMAP-BRIEF.md §3.2) —
 * a thin wrapper over the same createLocation() the /dashboard/locations
 * page uses, so plan-limit enforcement and validation live in one place.
 */
export async function createFirstLocation(formData: FormData) {
  return createLocation(formData);
}

/**
 * Step 2: seed the 12-type restaurant equipment catalogue
 * (src/lib/owner-templates.ts, §5.1). Idempotent — skips any type whose
 * lower(name) already exists for the company, so re-running (a double
 * click, or re-visiting the wizard) never duplicates rows.
 */
export async function seedRestaurantEquipmentTypes(): Promise<{ error: string; created?: undefined } | { created: number; error?: undefined }> {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can do this" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("equipment_types")
    .select("name")
    .eq("company_id", ctx.profile.company_id)
    .returns<{ name: string }[]>();

  const existingNames = new Set((existing ?? []).map((t) => t.name.toLowerCase()));
  const missing = RESTAURANT_EQUIPMENT_TEMPLATES.filter((t) => !existingNames.has(t.name.toLowerCase()));

  if (missing.length === 0) {
    return { created: 0 };
  }

  const { error } = await supabase.from("equipment_types").insert(
    missing.map((t) => ({
      company_id: ctx.profile.company_id,
      name: t.name,
      description: t.description,
      symptom_chips: t.symptom_chips,
    }))
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment-types");
  return { created: missing.length };
}

/** Marks the wizard done — dashboard/layout.tsx stops redirecting here once this is set. */
export async function finishOwnerSetup() {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can do this" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ owner_setup_completed_at: new Date().toISOString() })
    .eq("id", ctx.profile.company_id)
    .is("owner_setup_completed_at", null);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
