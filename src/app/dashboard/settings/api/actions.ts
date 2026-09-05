"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, type CurrentProfile } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey, type ApiScope } from "@/lib/api-auth";

export const MAX_ACTIVE_API_KEYS = 10;

async function requireApiOwner(): Promise<{ ctx: CurrentProfile } | { errorMessage: string }> {
  const ctx = await requireOwner();
  if (!ctx) {
    return { errorMessage: "Only owners can manage API keys" };
  }
  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "exportApi")) {
    return { errorMessage: "API access is available on the Business plan. Upgrade to create keys." };
  }
  return { ctx };
}

export async function createApiKey(formData: FormData) {
  const guard = await requireApiOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Name your key so you can tell it apart later" };
  }

  const scopes: ApiScope[] = ["read"];
  if (formData.get("scopeWrite") === "on") {
    scopes.push("write");
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.company.id)
    .is("revoked_at", null);

  if (countError) {
    return { error: countError.message };
  }
  if ((count ?? 0) >= MAX_ACTIVE_API_KEYS) {
    return { error: `You've reached the limit of ${MAX_ACTIVE_API_KEYS} active API keys. Revoke one first.` };
  }

  const { plaintext, keyPrefix, keyHash } = generateApiKey();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("api_keys").insert({
    company_id: ctx.company.id,
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes,
    created_by: user?.id ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/api");
  // The plaintext key is never stored — this is the only time it's returned.
  return { success: true, plaintext };
}

export async function revokeApiKey(keyId: string) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage API keys" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("company_id", ctx.company.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/api");
  return { success: true };
}
