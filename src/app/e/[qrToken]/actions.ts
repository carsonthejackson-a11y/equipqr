"use server";

import { createClient } from "@/lib/supabase/server";

export async function claimCode(token: string, equipmentId: string) {
  if (!equipmentId) {
    return { error: "Select which equipment this is" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_qr_code", {
    p_token: token,
    p_equipment_id: equipmentId,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
