"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Hides the Overview page's "Getting started" checklist early. Owner-only (matches the RLS update policy on companies), mirroring every other company-settings write in this app. */
export async function dismissOnboardingChecklist() {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ onboarding_dismissed_at: new Date().toISOString() })
    .eq("id", ctx.company.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
