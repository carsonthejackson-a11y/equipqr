"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, type CurrentProfile } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

async function requireBrandingOwner(): Promise<{ ctx: CurrentProfile } | { errorMessage: string }> {
  const ctx = await requireOwner();
  if (!ctx) {
    return { errorMessage: "Only owners can manage this" };
  }
  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "branding")) {
    return { errorMessage: "Custom branding is available on Pro and Business plans. Upgrade to enable it." };
  }
  return { ctx };
}

/**
 * The client uploads the file to the `company-assets` bucket itself (so the
 * large upload never round-trips through a server action), then calls this
 * to persist the path and best-effort clean up the previous logo object.
 */
export async function setCompanyLogo(logoPath: string) {
  const guard = await requireBrandingOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  if (!logoPath.startsWith(`${ctx.company.id}/branding/`)) {
    return { error: "Invalid upload path" };
  }

  const supabase = await createClient();
  const previousPath = ctx.company.logo_path;

  const { error } = await supabase.from("companies").update({ logo_path: logoPath }).eq("id", ctx.company.id);
  if (error) {
    return { error: error.message };
  }

  if (previousPath && previousPath !== logoPath) {
    const { error: removeError } = await supabase.storage.from("company-assets").remove([previousPath]);
    if (removeError) {
      console.error(`setCompanyLogo: failed to remove old logo ${previousPath}:`, removeError.message);
    }
  }

  revalidatePath("/dashboard/settings/branding");
  return { success: true, logoPath };
}

export async function removeCompanyLogo() {
  const guard = await requireBrandingOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  if (!ctx.company.logo_path) {
    return { success: true };
  }

  const supabase = await createClient();
  const previousPath = ctx.company.logo_path;

  const { error } = await supabase.from("companies").update({ logo_path: null }).eq("id", ctx.company.id);
  if (error) {
    return { error: error.message };
  }

  const { error: removeError } = await supabase.storage.from("company-assets").remove([previousPath]);
  if (removeError) {
    console.error(`removeCompanyLogo: failed to remove ${previousPath}:`, removeError.message);
  }

  revalidatePath("/dashboard/settings/branding");
  return { success: true };
}

export async function updateBranding(formData: FormData) {
  const guard = await requireBrandingOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  const brandColor = String(formData.get("brandColor") ?? "").trim();
  if (!HEX_COLOR_PATTERN.test(brandColor)) {
    return { error: "Enter a valid hex color, like #0d9488" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({ brand_color: brandColor })
    .eq("id", ctx.company.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/branding");
  return { success: true };
}
