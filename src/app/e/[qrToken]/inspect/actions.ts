"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitEquipmentEvent, emitRequestActivity } from "@/lib/events";
import {
  anyFailedItemRequired,
  buildFailedItemsDescription,
  createInspectionItems,
  inspectionItemsSchema,
  summarizeInspection,
  validateResponses,
} from "@/lib/checklists";
import type { ChecklistTemplate, Customer, Equipment, Inspection, InspectionItem } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Staff = { userId: string; companyId: string };

/**
 * Every action below is reachable directly (server actions are just POST
 * endpoints), so each one re-derives "is this a logged-in member of the
 * equipment's own company" itself rather than trusting the caller — the
 * page-level check in ./page.tsx is only a redirect for the friendly path.
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

export async function startInspection({
  equipmentId,
  templateId,
  serviceRequestId,
}: {
  equipmentId: string;
  templateId: string;
  serviceRequestId: string | null;
}): Promise<{ inspection: Inspection } | { error: string }> {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) return { error: "Not authenticated" };

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, company_id")
    .eq("id", equipmentId)
    .maybeSingle<Pick<Equipment, "id" | "company_id">>();
  if (!equipment || equipment.company_id !== staff.companyId) {
    return { error: "Equipment not found" };
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle<ChecklistTemplate>();
  if (!template || template.company_id !== staff.companyId) {
    return { error: "Checklist not found" };
  }

  // The ?request= query param is staff-supplied — verify it actually names an
  // open request on THIS equipment before linking the inspection to it.
  let verifiedRequestId: string | null = null;
  if (serviceRequestId) {
    const { data: linkedRequest } = await supabase
      .from("service_requests")
      .select("id")
      .eq("id", serviceRequestId)
      .eq("equipment_id", equipmentId)
      .maybeSingle();
    verifiedRequestId = linkedRequest?.id ?? null;
  }

  const items = createInspectionItems(template.items);

  const { data, error } = await supabase
    .from("inspections")
    .insert({
      company_id: staff.companyId,
      equipment_id: equipmentId,
      checklist_template_id: template.id,
      service_request_id: verifiedRequestId,
      performed_by: staff.userId,
      status: "in_progress",
      template_name: template.name,
      items,
    })
    .select("*")
    .single<Inspection>();

  if (error || !data) {
    return { error: error?.message ?? "Couldn't start the inspection" };
  }

  return { inspection: data };
}

/**
 * Autosave: called on every response change (debounced by the client) so a
 * dropped connection mid-inspection loses at most a few seconds of work.
 * Silently no-ops if the inspection was already completed elsewhere.
 */
export async function saveInspectionItems(
  inspectionId: string,
  items: InspectionItem[]
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) return { error: "Not authenticated" };

  const parsed = inspectionItemsSchema.safeParse(items);
  if (!parsed.success) {
    return { error: "Couldn't save — unexpected response data" };
  }

  const { error } = await supabase
    .from("inspections")
    .update({ items: parsed.data })
    .eq("id", inspectionId)
    .eq("company_id", staff.companyId)
    .eq("status", "in_progress");

  if (error) return { error: error.message };
  return { success: true };
}

export async function completeInspection({
  inspectionId,
  summary,
  signedByName,
  signaturePath,
}: {
  inspectionId: string;
  summary: string;
  signedByName: string | null;
  signaturePath: string | null;
}): Promise<{ success: true; failedCount: number; failedLabels: string[] } | { error: string }> {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) return { error: "Not authenticated" };

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle<Inspection>();

  if (!inspection || inspection.company_id !== staff.companyId) {
    return { error: "Inspection not found" };
  }
  if (inspection.status !== "in_progress") {
    return { error: "This inspection was already finished" };
  }

  const validation = validateResponses(inspection.items);
  if (!validation.valid) {
    return { error: `Answer these required items first: ${validation.missingLabels.join(", ")}` };
  }

  const { failedCount, failedLabels } = summarizeInspection(inspection.items);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("inspections")
    .update({
      status: "completed",
      completed_at: now,
      summary: summary.trim() || null,
      failed_count: failedCount,
      ...(signaturePath ? { signature_path: signaturePath, signed_by_name: signedByName, signed_at: now } : {}),
    })
    .eq("id", inspectionId);

  if (error) return { error: error.message };

  await emitEquipmentEvent(supabase, {
    companyId: inspection.company_id,
    equipmentId: inspection.equipment_id,
    kind: "inspection_completed",
    summary:
      failedCount > 0
        ? `${inspection.template_name} — ${failedCount} item${failedCount === 1 ? "" : "s"} failed`
        : `${inspection.template_name} — no issues found`,
    details: {
      inspection_id: inspection.id,
      template_name: inspection.template_name,
      failed_count: failedCount,
      failed_labels: failedLabels,
    },
    serviceRequestId: inspection.service_request_id,
    actorKind: "staff",
    actorUserId: staff.userId,
  });

  if (inspection.service_request_id) {
    await emitRequestActivity(supabase, {
      companyId: inspection.company_id,
      serviceRequestId: inspection.service_request_id,
      kind: "note",
      visibility: "internal",
      body:
        failedCount > 0
          ? `Inspection "${inspection.template_name}" completed — ${failedCount} item(s) failed: ${failedLabels.join(", ")}`
          : `Inspection "${inspection.template_name}" completed — no issues found`,
      authorKind: "staff",
      authorUserId: staff.userId,
    });
  }

  revalidatePath(`/dashboard/equipment/${inspection.equipment_id}`);
  revalidatePath("/dashboard/checklists/inspections");
  revalidatePath(`/dashboard/inspections/${inspectionId}`);
  // Bracketed literal + explicit type, per docs/NEXT-ROADMAP-BRIEF.md — Next
  // can't derive the route type from a path containing a dynamic segment.
  revalidatePath("/e/[qrToken]", "page");

  return { success: true, failedCount, failedLabels };
}

export async function createFollowUpRequest(
  inspectionId: string
): Promise<{ requestId: string; publicToken: string } | { error: string }> {
  const supabase = await createClient();
  const staff = await currentStaff(supabase);
  if (!staff) return { error: "Not authenticated" };

  const { data: inspection } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle<Inspection>();

  if (!inspection || inspection.company_id !== staff.companyId) {
    return { error: "Inspection not found" };
  }
  if (inspection.status !== "completed") {
    return { error: "Complete the inspection first" };
  }

  const failedItems = inspection.items.filter((item) => item.response.passed === false);
  if (failedItems.length === 0) {
    return { error: "No failed items on this inspection" };
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", inspection.equipment_id)
    .maybeSingle<Equipment>();
  if (!equipment) {
    return { error: "Equipment not found" };
  }

  const { data: customer } = equipment.customer_id
    ? await supabase.from("customers").select("*").eq("id", equipment.customer_id).maybeSingle<Customer>()
    : { data: null as Customer | null };

  const contactName =
    equipment.contact_name?.trim() ||
    customer?.contact_name?.trim() ||
    customer?.name?.trim() ||
    "Facility contact";
  const contactEmail = customer?.contact_email ?? null;
  const contactPhone = equipment.contact_phone ?? customer?.contact_phone ?? null;
  const priority = anyFailedItemRequired(inspection.items) ? "high" : "normal";
  const description = buildFailedItemsDescription(inspection.template_name, inspection.items);

  const { data: request, error } = await supabase
    .from("service_requests")
    .insert({
      equipment_id: inspection.equipment_id,
      company_id: inspection.company_id,
      customer_id: equipment.customer_id,
      description,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      priority,
      source: "staff",
      inspection_id: inspection.id,
    })
    .select("id, public_token")
    .single<{ id: string; public_token: string }>();

  if (error || !request) {
    return { error: error?.message ?? "Couldn't create the request" };
  }

  await emitEquipmentEvent(supabase, {
    companyId: inspection.company_id,
    equipmentId: inspection.equipment_id,
    kind: "request_submitted",
    summary: `Service request created from a failed inspection (${failedItems.length} item${
      failedItems.length === 1 ? "" : "s"
    })`,
    details: { inspection_id: inspection.id, failed_count: failedItems.length },
    serviceRequestId: request.id,
    actorKind: "staff",
    actorUserId: staff.userId,
  });

  await emitRequestActivity(supabase, {
    companyId: inspection.company_id,
    serviceRequestId: request.id,
    kind: "note",
    visibility: "internal",
    body: description,
    authorKind: "staff",
    authorUserId: staff.userId,
  });

  await emitRequestActivity(supabase, {
    companyId: inspection.company_id,
    serviceRequestId: request.id,
    kind: "status_change",
    visibility: "customer",
    body: "Request received",
    authorKind: "system",
  });

  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/inspections/${inspectionId}`);
  revalidatePath("/e/[qrToken]", "page");

  return { requestId: request.id, publicToken: request.public_token };
}
