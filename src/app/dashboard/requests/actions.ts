"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/types";

export async function updateRequestStatus(id: string, status: RequestStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_requests")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true };
}
