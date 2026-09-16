"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/features";

export async function generateBatch(companyId: string, formData: FormData) {
  // Server actions aren't wrapped by admin/layout.tsx's render-time checks
  // either (same reasoning as export/route.ts) — since that layout no
  // longer 404s this whole section when batch QR is parked (C1-42), this
  // mutating action needs its own check so "parked" still means parked.
  if (!FEATURES.batchQr) {
    return { error: "Batch QR is currently disabled." };
  }

  const count = Number(formData.get("count"));

  if (!companyId) {
    return { error: "Select a company first" };
  }

  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return { error: "Enter a count between 1 and 500" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_qr_code_batch", {
    p_company_id: companyId,
    p_count: count,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/qr-codes");
  return { success: true };
}
