"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertCanAddLocation } from "@/lib/billing";
import { requireOwner } from "@/lib/auth";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentCompanyId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle<{ company_id: string }>();
  return profile?.company_id ?? null;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function nullable(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

const SITE_PIN_PATTERN = /^[0-9]{4,8}$/;

export async function createLocation(
  formData: FormData
): Promise<{ error: string; id?: undefined } | { id: string; error?: undefined }> {
  const name = text(formData, "name");
  if (!name) {
    return { error: "Name is required" };
  }

  const limitError = await assertCanAddLocation();
  if (limitError) {
    return limitError;
  }

  const supabase = await createClient();
  const companyId = await currentCompanyId(supabase);
  if (!companyId) {
    return { error: "No company found for this account" };
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({
      company_id: companyId,
      name,
      address: nullable(formData, "address"),
      phone: nullable(formData, "phone"),
      hours: nullable(formData, "hours"),
      notes: nullable(formData, "notes"),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return { error: "A location with that name already exists" };
    }
    if (error.message.startsWith("LOCATION_LIMIT_REACHED")) {
      return { error: "You've reached your plan's location limit. Upgrade to add more." };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/locations");
  return { id: data.id };
}

export async function updateLocation(id: string, formData: FormData) {
  const name = text(formData, "name");
  if (!name) {
    return { error: "Name is required" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .update({
      name,
      address: nullable(formData, "address"),
      phone: nullable(formData, "phone"),
      hours: nullable(formData, "hours"),
      notes: nullable(formData, "notes"),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A location with that name already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/locations");
  revalidatePath(`/dashboard/locations/${id}`);
  return { success: true };
}

export async function setSitePin(id: string, pin: string) {
  const trimmed = pin.trim();
  if (!SITE_PIN_PATTERN.test(trimmed)) {
    return { error: "Enter a 4 to 8 digit code" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("locations").update({ site_pin: trimmed }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/locations/${id}`);
  revalidatePath(`/dashboard/locations/${id}/poster`);
  return { success: true };
}

export async function clearSitePin(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").update({ site_pin: null }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/locations/${id}`);
  revalidatePath(`/dashboard/locations/${id}/poster`);
  return { success: true };
}

export async function deactivateLocation(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").update({ active }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/locations");
  revalidatePath(`/dashboard/locations/${id}`);
  return { success: true };
}

export async function deleteLocation(id: string) {
  // Deleting a location is an owner decision (equipment.location_id cascades
  // to null, and any dispatch history tied to units there stays intact) —
  // same rule as deleteEquipment().
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can delete locations." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/locations");
  return { success: true };
}
