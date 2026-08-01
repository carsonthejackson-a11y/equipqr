"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function generateBatch(companyId: string, formData: FormData) {
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
