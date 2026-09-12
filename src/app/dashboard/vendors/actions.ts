"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

/** "Refrigeration, Ice machines" → ["Refrigeration", "Ice machines"] — trimmed, empties dropped. */
function parseCategories(formData: FormData): string[] {
  return text(formData, "categories")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function ackSlaMinutes(formData: FormData): number {
  const raw = Number.parseInt(text(formData, "ackSlaMinutes"), 10);
  if (!Number.isFinite(raw)) return 120;
  return Math.min(10080, Math.max(15, raw));
}

export async function createVendor(
  formData: FormData
): Promise<{ error: string; id?: undefined } | { id: string; error?: undefined }> {
  const name = text(formData, "name");
  if (!name) {
    return { error: "Name is required" };
  }

  const email = nullable(formData, "email");
  if (email && !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) {
    return { error: "Enter a valid email, with no commas or spaces" };
  }

  const supabase = await createClient();
  const companyId = await currentCompanyId(supabase);
  if (!companyId) {
    return { error: "No company found for this account" };
  }

  const { data, error } = await supabase
    .from("vendors")
    .insert({
      company_id: companyId,
      name,
      email,
      phone: nullable(formData, "phone"),
      hours: nullable(formData, "hours"),
      account_number: nullable(formData, "accountNumber"),
      categories: parseCategories(formData),
      notes: nullable(formData, "notes"),
      ack_sla_minutes: ackSlaMinutes(formData),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return { error: "A vendor with that name already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/vendors");
  return { id: data.id };
}

export async function updateVendor(id: string, formData: FormData) {
  const name = text(formData, "name");
  if (!name) {
    return { error: "Name is required" };
  }

  const email = nullable(formData, "email");
  if (email && !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) {
    return { error: "Enter a valid email, with no commas or spaces" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      name,
      email,
      phone: nullable(formData, "phone"),
      hours: nullable(formData, "hours"),
      account_number: nullable(formData, "accountNumber"),
      categories: parseCategories(formData),
      notes: nullable(formData, "notes"),
      ack_sla_minutes: ackSlaMinutes(formData),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A vendor with that name already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/vendors");
  revalidatePath(`/dashboard/vendors/${id}`);
  return { success: true };
}

export async function deactivateVendor(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("vendors").update({ active }).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/vendors");
  revalidatePath(`/dashboard/vendors/${id}`);
  return { success: true };
}

export async function deleteVendor(id: string) {
  // Same owner-only rule as deleteEquipment()/deleteLocation() — and the DB
  // also enforces `on delete restrict` from dispatches, so a vendor with
  // dispatch history can only be deactivated, never deleted (§2.1.6).
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can delete vendors." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("vendors").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        error: "This vendor has dispatch history and can't be deleted — deactivate it instead.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard/vendors");
  return { success: true };
}

export async function setCategoryDefault(equipmentTypeId: string, vendorId: string) {
  const supabase = await createClient();
  const companyId = await currentCompanyId(supabase);
  if (!companyId) {
    return { error: "No company found for this account" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("category_default_vendors").upsert(
    {
      company_id: companyId,
      equipment_type_id: equipmentTypeId,
      vendor_id: vendorId,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,equipment_type_id" }
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/vendors");
  revalidatePath(`/dashboard/vendors/${vendorId}`);
  revalidatePath("/dashboard/equipment-types");
  return { success: true };
}

export async function clearCategoryDefault(equipmentTypeId: string) {
  const supabase = await createClient();
  const companyId = await currentCompanyId(supabase);
  if (!companyId) {
    return { error: "No company found for this account" };
  }

  const { error } = await supabase
    .from("category_default_vendors")
    .delete()
    .eq("company_id", companyId)
    .eq("equipment_type_id", equipmentTypeId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/vendors");
  revalidatePath("/dashboard/equipment-types");
  return { success: true };
}
