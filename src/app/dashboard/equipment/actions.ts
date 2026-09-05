"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeQrCode } from "@/lib/qr";
import { createInstantCode } from "@/lib/qr-codes";
import { assertCanAddEquipment } from "@/lib/billing";
import { emitEquipmentEvent } from "@/lib/events";
import { requireOwner } from "@/lib/auth";
import {
  MAX_DOCUMENT_BYTES,
  MAX_NOTE_LENGTH,
  diffEquipment,
  equipmentUpdateSummary,
  isAllowedDocumentType,
  isEquipmentStatus,
  statusChangeSummary,
  type EquipmentPatch,
} from "@/lib/equipment";
import { formatBytes } from "@/lib/format";
import type { Equipment, EquipmentDocument, EquipmentStatus } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Staff = { userId: string; companyId: string };

/**
 * The signed-in staff member's user + company. Server actions return an
 * `{ error }` rather than redirecting, so this returns null instead of
 * bouncing the way getCurrentProfile() does.
 */
async function currentStaff(supabase: Supabase): Promise<Staff | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle<{ company_id: string }>();
  if (!profile) return null;

  return { userId: user.id, companyId: profile.company_id };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Empty form fields mean "unset", not "empty string" — the columns are nullable. */
function nullable(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function statusFrom(formData: FormData, fallback: EquipmentStatus = "active"): EquipmentStatus {
  const raw = text(formData, "status");
  return isEquipmentStatus(raw) ? raw : fallback;
}

/** Reads the whole writable slice of an equipment row out of a submitted form. */
function patchFromForm(formData: FormData, fallbackStatus?: EquipmentStatus): EquipmentPatch {
  return {
    name: text(formData, "name"),
    equipment_type_id: text(formData, "equipmentTypeId"),
    customer_id: nullable(formData, "customerId"),
    make: nullable(formData, "make"),
    model: nullable(formData, "model"),
    serial_number: nullable(formData, "serialNumber"),
    location: nullable(formData, "location"),
    address: nullable(formData, "address"),
    contact_name: nullable(formData, "contactName"),
    contact_phone: nullable(formData, "contactPhone"),
    install_date: nullable(formData, "installDate"),
    warranty_ends_on: nullable(formData, "warrantyEndsOn"),
    status: statusFrom(formData, fallbackStatus),
    notes: nullable(formData, "notes"),
  };
}

async function assignCode(
  supabase: Supabase,
  equipmentId: string,
  companyId: string,
  formData: FormData
) {
  const codeSource = String(formData.get("codeSource") ?? "instant");

  if (codeSource === "instant") {
    return createInstantCode(supabase, equipmentId, companyId);
  }

  if (codeSource === "preprinted") {
    const rawCode = String(formData.get("preprintedCode") ?? "").trim();
    if (!rawCode) {
      return "Enter the code from a pre-printed sticker, or choose to generate one instead";
    }
    const { error } = await supabase.rpc("claim_qr_code", {
      p_token: normalizeQrCode(rawCode),
      p_equipment_id: equipmentId,
    });
    return error ? error.message : null;
  }

  return null;
}

export async function createEquipment(
  formData: FormData
): Promise<
  | { error: string; id?: undefined; codeError?: undefined }
  | { id: string; codeError: string | null; error?: undefined }
> {
  const patch = patchFromForm(formData);

  if (!patch.name || !patch.equipment_type_id) {
    return { error: "Name and equipment type are required" };
  }

  const limitError = await assertCanAddEquipment();
  if (limitError) {
    return limitError;
  }

  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "No company found for this account" };
  }

  const { data, error } = await supabase
    .from("equipment")
    .insert({ company_id: staff.companyId, ...patch })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return { error: error.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: staff.companyId,
    equipmentId: data.id,
    kind: "equipment_created",
    summary: `Equipment added: ${patch.name}`,
    actorUserId: staff.userId,
  });

  const codeError = await assignCode(supabase, data.id, staff.companyId, formData);

  revalidatePath("/dashboard/equipment");
  return { id: data.id, codeError };
}

export async function updateEquipment(id: string, formData: FormData) {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  // Read the row first: the timeline entry has to say what actually changed,
  // and RLS already limits this to the caller's own company.
  const { data: existing } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id)
    .maybeSingle<Equipment>();

  if (!existing) {
    return { error: "Equipment not found" };
  }

  const patch = patchFromForm(formData, existing.status);

  if (!patch.name || !patch.equipment_type_id) {
    return { error: "Name and equipment type are required" };
  }

  const { error } = await supabase.from("equipment").update(patch).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  const changed = diffEquipment(existing, patch);

  if (changed.length > 0) {
    await emitEquipmentEvent(supabase, {
      companyId: existing.company_id,
      equipmentId: id,
      kind: "equipment_updated",
      summary: equipmentUpdateSummary(changed),
      details: { fields: changed },
      actorUserId: staff.userId,
    });

    // A status move gets its own row so the timeline reads as a history of
    // the unit's condition, not just "someone edited something".
    if (changed.includes("status")) {
      await emitEquipmentEvent(supabase, {
        companyId: existing.company_id,
        equipmentId: id,
        kind: "status_changed",
        summary: statusChangeSummary(existing.status, patch.status),
        details: { from: existing.status, to: patch.status },
        actorUserId: staff.userId,
      });
    }
  }

  revalidatePath("/dashboard/equipment");
  revalidatePath(`/dashboard/equipment/${id}`);
  return { success: true };
}

export async function deleteEquipment(id: string) {
  // Technicians can edit a unit all day; retiring one from the system is an
  // owner decision (the QR sticker in the field stops resolving).
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can delete equipment." };
  }

  const supabase = await createClient();
  // equipment_events / equipment_documents / qr_codes all cascade on delete.
  const { error } = await supabase.from("equipment").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/equipment");
  return { success: true };
}

export async function assignQrCode(equipmentId: string, companyId: string, formData: FormData) {
  const supabase = await createClient();
  const codeError = await assignCode(supabase, equipmentId, companyId, formData);

  if (codeError) {
    return { error: codeError };
  }

  revalidatePath(`/dashboard/equipment/${equipmentId}`);
  return { success: true };
}

// ----------------------------------------------------------------------------
// Photo
// ----------------------------------------------------------------------------

/**
 * Points a unit at a freshly uploaded object in the public `company-assets`
 * bucket. The client uploads (RLS on storage.objects checks the `<company_id>/`
 * prefix), then calls this to record the path.
 */
export async function setEquipmentPhoto(id: string, path: string) {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  // Never let a caller point a unit at another tenant's object.
  if (!path.startsWith(`${staff.companyId}/`)) {
    return { error: "That file doesn't belong to this company." };
  }

  const { data: existing } = await supabase
    .from("equipment")
    .select("id, company_id, photo_path")
    .eq("id", id)
    .maybeSingle<Pick<Equipment, "id" | "company_id" | "photo_path">>();

  if (!existing) {
    return { error: "Equipment not found" };
  }

  const { error } = await supabase.from("equipment").update({ photo_path: path }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  // Best effort: an orphaned object costs a few KB, a failed save costs the user their work.
  if (existing.photo_path && existing.photo_path !== path) {
    await supabase.storage.from("company-assets").remove([existing.photo_path]);
  }

  await emitEquipmentEvent(supabase, {
    companyId: existing.company_id,
    equipmentId: id,
    kind: "photo_added",
    summary: existing.photo_path ? "Photo replaced" : "Photo added",
    actorUserId: staff.userId,
  });

  revalidatePath(`/dashboard/equipment/${id}`);
  return { success: true };
}

export async function removeEquipmentPhoto(id: string) {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  const { data: existing } = await supabase
    .from("equipment")
    .select("id, company_id, photo_path")
    .eq("id", id)
    .maybeSingle<Pick<Equipment, "id" | "company_id" | "photo_path">>();

  if (!existing) {
    return { error: "Equipment not found" };
  }

  const { error } = await supabase.from("equipment").update({ photo_path: null }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  if (existing.photo_path) {
    await supabase.storage.from("company-assets").remove([existing.photo_path]);
  }

  await emitEquipmentEvent(supabase, {
    companyId: existing.company_id,
    equipmentId: id,
    kind: "equipment_updated",
    summary: "Photo removed",
    details: { fields: ["photo_path"] },
    actorUserId: staff.userId,
  });

  revalidatePath(`/dashboard/equipment/${id}`);
  return { success: true };
}

// ----------------------------------------------------------------------------
// Documents
// ----------------------------------------------------------------------------

export type AddEquipmentDocumentInput = {
  equipmentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

/** Records a document the client already uploaded to the private `equipment-files` bucket. */
export async function addEquipmentDocument(input: AddEquipmentDocumentInput) {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  if (!input.storagePath.startsWith(`${staff.companyId}/`)) {
    return { error: "That file doesn't belong to this company." };
  }

  // The uploader checks these too, for a fast message — but the browser is not
  // where a limit is enforced.
  const fileName = input.fileName.trim();
  if (!fileName) {
    return { error: "That file has no name." };
  }
  if (input.sizeBytes !== null && input.sizeBytes > MAX_DOCUMENT_BYTES) {
    return { error: `Files must be under ${formatBytes(MAX_DOCUMENT_BYTES)}.` };
  }
  if (!isAllowedDocumentType(input.mimeType)) {
    return { error: `${input.mimeType} files aren't supported here.` };
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, company_id")
    .eq("id", input.equipmentId)
    .maybeSingle<Pick<Equipment, "id" | "company_id">>();

  if (!equipment) {
    return { error: "Equipment not found" };
  }

  const { error } = await supabase.from("equipment_documents").insert({
    company_id: equipment.company_id,
    equipment_id: equipment.id,
    storage_path: input.storagePath,
    file_name: fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    uploaded_by: staff.userId,
  });

  if (error) {
    return { error: error.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: equipment.company_id,
    equipmentId: equipment.id,
    kind: "document_added",
    summary: `Document added: ${fileName}`,
    details: { file_name: fileName },
    actorUserId: staff.userId,
  });

  revalidatePath(`/dashboard/equipment/${input.equipmentId}`);
  return { success: true };
}

export async function deleteEquipmentDocument(documentId: string) {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  const [{ data: document }, { data: profile }] = await Promise.all([
    supabase
      .from("equipment_documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle<EquipmentDocument>(),
    supabase.from("profiles").select("role").eq("id", staff.userId).maybeSingle<{ role: string }>(),
  ]);

  if (!document) {
    return { error: "Document not found" };
  }

  // Whoever uploaded it can take it back down; otherwise it takes an owner.
  const isOwner = profile?.role === "owner";
  if (!isOwner && document.uploaded_by !== staff.userId) {
    return { error: "Only the person who uploaded this file, or an owner, can delete it." };
  }

  const { error } = await supabase.from("equipment_documents").delete().eq("id", documentId);
  if (error) {
    return { error: error.message };
  }

  await supabase.storage.from("equipment-files").remove([document.storage_path]);

  await emitEquipmentEvent(supabase, {
    companyId: document.company_id,
    equipmentId: document.equipment_id,
    kind: "document_removed",
    summary: `Document removed: ${document.file_name}`,
    details: { file_name: document.file_name },
    actorUserId: staff.userId,
  });

  revalidatePath(`/dashboard/equipment/${document.equipment_id}`);
  return { success: true };
}

// ----------------------------------------------------------------------------
// Timeline entries
// ----------------------------------------------------------------------------

export async function addEquipmentNote(equipmentId: string, formData: FormData) {
  const body = text(formData, "note");
  if (!body) {
    return { error: "Write a note first" };
  }
  if (body.length > MAX_NOTE_LENGTH) {
    return { error: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, company_id")
    .eq("id", equipmentId)
    .maybeSingle<Pick<Equipment, "id" | "company_id">>();

  if (!equipment) {
    return { error: "Equipment not found" };
  }

  const event = await emitEquipmentEvent(supabase, {
    companyId: equipment.company_id,
    equipmentId: equipment.id,
    kind: "note",
    summary: body,
    actorUserId: staff.userId,
  });

  if (!event) {
    return { error: "Couldn't save that note. Please try again." };
  }

  revalidatePath(`/dashboard/equipment/${equipmentId}`);
  return { success: true };
}

/**
 * The "we were out there" quick entry: appends a `visit_completed` event and
 * moves the unit's last_serviced_at forward (never backward — a back-dated
 * catch-up entry shouldn't undo a more recent visit).
 */
export async function logEquipmentService(equipmentId: string, formData: FormData) {
  const date = text(formData, "servicedOn");
  const summary = text(formData, "summary");

  if (!date) {
    return { error: "Pick the date the work happened" };
  }
  if (!summary) {
    return { error: "Describe what was done" };
  }
  if (summary.length > MAX_NOTE_LENGTH) {
    return { error: `Keep the summary under ${MAX_NOTE_LENGTH} characters.` };
  }

  const servicedAt = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(servicedAt.getTime())) {
    return { error: "That doesn't look like a valid date" };
  }

  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) {
    return { error: "Not authenticated" };
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, company_id, last_serviced_at")
    .eq("id", equipmentId)
    .maybeSingle<Pick<Equipment, "id" | "company_id" | "last_serviced_at">>();

  if (!equipment) {
    return { error: "Equipment not found" };
  }

  const event = await emitEquipmentEvent(supabase, {
    companyId: equipment.company_id,
    equipmentId: equipment.id,
    kind: "visit_completed",
    summary,
    details: { serviced_on: date },
    actorUserId: staff.userId,
    occurredAt: servicedAt.toISOString(),
  });

  if (!event) {
    return { error: "Couldn't save that service entry. Please try again." };
  }

  const previous = equipment.last_serviced_at ? new Date(equipment.last_serviced_at) : null;
  if (!previous || servicedAt > previous) {
    const { error } = await supabase
      .from("equipment")
      .update({ last_serviced_at: servicedAt.toISOString() })
      .eq("id", equipmentId);
    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath("/dashboard/equipment");
  revalidatePath(`/dashboard/equipment/${equipmentId}`);
  return { success: true };
}
