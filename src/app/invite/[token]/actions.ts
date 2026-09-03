"use server";

import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(token: string, fullName: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to accept this invitation" };
  }

  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
    p_full_name: fullName.trim(),
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, companyId: data as string };
}
