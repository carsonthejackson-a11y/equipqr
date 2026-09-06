"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";

const MIN_BATCH = 1;
const MAX_BATCH = 100;

async function requireBlankCodesOwner() {
  const ctx = await requireOwner();
  if (!ctx) {
    return { errorMessage: "Only company owners can manage blank codes" };
  }
  const entitlements = await getEntitlements();
  if (!FEATURES.batchQr || !hasFeature(entitlements, "batchQr")) {
    return { errorMessage: "Blank code batches are available on the Pro plan. Upgrade to generate one." };
  }
  return { ctx };
}

/** Generates 1-100 unclaimed pre-printed codes via generate_company_qr_batch (owner-only, RPC-enforced too). */
export async function generateBlankCodes(formData: FormData) {
  const guard = await requireBlankCodesOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }

  const count = Number(formData.get("count"));
  if (!Number.isInteger(count) || count < MIN_BATCH || count > MAX_BATCH) {
    return { error: `Enter a count between ${MIN_BATCH} and ${MAX_BATCH}` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_company_qr_batch", { p_count: count });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/qr-codes");
  return { success: true };
}
