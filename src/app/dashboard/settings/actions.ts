"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateCompanySettings(companyId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const notificationEmail = String(formData.get("notificationEmail") ?? "").trim();

  if (!name || !notificationEmail) {
    return { error: "Company name and notification email are required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ name, notification_email: notificationEmail })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
