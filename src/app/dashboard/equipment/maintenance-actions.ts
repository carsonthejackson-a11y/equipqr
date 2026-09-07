"use server";

// Preventive-maintenance schedules: create/edit/pause/delete, and "mark
// done" (resolves the schedule's open PM request, or creates + resolves one
// on the spot). See docs/NEXT-ROADMAP-BRIEF.md workstream C.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { emitEquipmentEvent } from "@/lib/events";
import { OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import type { Customer, Equipment, MaintenanceSchedule, ServiceRequest } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function nullableText(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function intOrNull(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function revalidateMaintenance(equipmentId?: string) {
  revalidatePath("/dashboard/maintenance");
  revalidatePath("/dashboard/schedule");
  if (equipmentId) revalidatePath(`/dashboard/equipment/${equipmentId}`);
}

type SchedulePatch = {
  equipment_id: string;
  name: string;
  description: string | null;
  interval_days: number;
  lead_days: number;
  next_due_on: string;
  auto_create_request: boolean;
  notify_customer: boolean;
  checklist_template_id: string | null;
};

function patchFromForm(formData: FormData): { patch: SchedulePatch } | { error: string } {
  const equipmentId = text(formData, "equipmentId");
  const name = text(formData, "name");
  const intervalDays = intOrNull(formData, "intervalDays");
  const leadDays = intOrNull(formData, "leadDays") ?? 14;
  const nextDueOn = text(formData, "nextDueOn");

  if (!equipmentId) return { error: "Choose which equipment this schedule is for" };
  if (!name) return { error: "Name this schedule (e.g. \"Descale\")" };
  if (!intervalDays || intervalDays < 1 || intervalDays > 3650) {
    return { error: "Interval must be between 1 and 3650 days" };
  }
  if (leadDays < 0 || leadDays > 365) {
    return { error: "Lead time must be between 0 and 365 days" };
  }
  if (!nextDueOn || Number.isNaN(new Date(`${nextDueOn}T00:00:00Z`).getTime())) {
    return { error: "Pick the next due date" };
  }

  return {
    patch: {
      equipment_id: equipmentId,
      name,
      description: nullableText(formData, "description"),
      interval_days: intervalDays,
      lead_days: leadDays,
      next_due_on: nextDueOn,
      auto_create_request: formData.get("autoCreateRequest") === "on",
      notify_customer: formData.get("notifyCustomer") === "on",
      checklist_template_id: nullableText(formData, "checklistTemplateId"),
    },
  };
}

export async function createMaintenanceSchedule(formData: FormData) {
  const parsed = patchFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { patch } = parsed;

  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("id, company_id, name")
    .eq("id", patch.equipment_id)
    .maybeSingle<Pick<Equipment, "id" | "company_id" | "name">>();

  if (!equipment) {
    return { error: "Equipment not found" };
  }

  const { data: created, error } = await supabase
    .from("maintenance_schedules")
    .insert({ company_id: company.id, created_by: profile.id, ...patch })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return { error: error.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: company.id,
    equipmentId: patch.equipment_id,
    kind: "equipment_updated",
    summary: `Maintenance schedule added: ${patch.name}`,
    details: { maintenance_schedule_id: created.id, interval_days: patch.interval_days },
    actorUserId: profile.id,
  });

  revalidateMaintenance(patch.equipment_id);
  return { success: true, id: created.id };
}

export async function updateMaintenanceSchedule(id: string, formData: FormData) {
  const parsed = patchFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { patch } = parsed;

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: existing } = await supabase
    .from("maintenance_schedules")
    .select("*")
    .eq("id", id)
    .maybeSingle<MaintenanceSchedule>();

  if (!existing) {
    return { error: "Maintenance schedule not found" };
  }

  // equipment_id has no DB-level constraint tying it to the same company as
  // the schedule, so a reassignment has to be checked here: RLS scopes this
  // lookup to the caller's own company, so a foreign id simply won't come back.
  if (patch.equipment_id !== existing.equipment_id) {
    const { data: targetEquipment } = await supabase
      .from("equipment")
      .select("id")
      .eq("id", patch.equipment_id)
      .maybeSingle<Pick<Equipment, "id">>();
    if (!targetEquipment) {
      return { error: "Equipment not found" };
    }
  }

  const { error } = await supabase.from("maintenance_schedules").update(patch).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: existing.company_id,
    equipmentId: patch.equipment_id,
    kind: "equipment_updated",
    summary: `Maintenance schedule updated: ${patch.name}`,
    details: { maintenance_schedule_id: id },
    actorUserId: profile.id,
  });

  revalidateMaintenance(patch.equipment_id);
  // The unit may have changed on edit — the old one needs a revalidate too.
  if (existing.equipment_id !== patch.equipment_id) {
    revalidatePath(`/dashboard/equipment/${existing.equipment_id}`);
  }
  return { success: true };
}

export async function toggleMaintenanceSchedule(id: string, active: boolean) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: existing } = await supabase
    .from("maintenance_schedules")
    .select("company_id, equipment_id, name")
    .eq("id", id)
    .maybeSingle<Pick<MaintenanceSchedule, "company_id" | "equipment_id" | "name">>();

  if (!existing) {
    return { error: "Maintenance schedule not found" };
  }

  const { error } = await supabase.from("maintenance_schedules").update({ active }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: existing.company_id,
    equipmentId: existing.equipment_id,
    kind: "equipment_updated",
    summary: `Maintenance schedule ${active ? "resumed" : "paused"}: ${existing.name}`,
    details: { maintenance_schedule_id: id, active },
    actorUserId: profile.id,
  });

  revalidateMaintenance(existing.equipment_id);
  return { success: true };
}

export async function deleteMaintenanceSchedule(id: string) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: existing } = await supabase
    .from("maintenance_schedules")
    .select("company_id, equipment_id, name")
    .eq("id", id)
    .maybeSingle<Pick<MaintenanceSchedule, "company_id" | "equipment_id" | "name">>();

  if (!existing) {
    return { error: "Maintenance schedule not found" };
  }

  const { error } = await supabase.from("maintenance_schedules").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  await emitEquipmentEvent(supabase, {
    companyId: existing.company_id,
    equipmentId: existing.equipment_id,
    kind: "equipment_updated",
    summary: `Maintenance schedule removed: ${existing.name}`,
    actorUserId: profile.id,
  });

  revalidateMaintenance(existing.equipment_id);
  return { success: true };
}

/**
 * "We just did this." If a PM request from the current cycle is already open
 * (`last_request_id`, set by the pm-due cron), resolves it. Otherwise creates
 * one and immediately resolves it. Either way the resolve is a two-step
 * insert-then-update (or update-only) so the 0013/0019 triggers — which only
 * fire on UPDATE — stamp `resolved_at`, roll `last_serviced_at` forward,
 * write the `request_resolved` timeline event, and advance the schedule's
 * `next_due_on`.
 */
export async function markMaintenanceDone(scheduleId: string) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: schedule } = await supabase
    .from("maintenance_schedules")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle<MaintenanceSchedule>();

  if (!schedule) {
    return { error: "Maintenance schedule not found" };
  }

  const targetId = await resolveOrCreatePmRequest(supabase, schedule);
  if ("error" in targetId) {
    return { error: targetId.error };
  }

  const { error } = await supabase
    .from("service_requests")
    .update({
      status: "resolved",
      resolution_summary: `Preventive maintenance completed: ${schedule.name}`,
      closed_by: profile.id,
    })
    .eq("id", targetId.id);

  if (error) {
    return { error: error.message };
  }

  revalidateMaintenance(schedule.equipment_id);
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${targetId.id}`);
  return { success: true, requestId: targetId.id };
}

async function resolveOrCreatePmRequest(
  supabase: SupabaseServerClient,
  schedule: MaintenanceSchedule
): Promise<{ id: string } | { error: string }> {
  if (schedule.last_request_id) {
    const { data: existingRequest } = await supabase
      .from("service_requests")
      .select("id, status")
      .eq("id", schedule.last_request_id)
      .maybeSingle<Pick<ServiceRequest, "id" | "status">>();

    if (existingRequest && OPEN_REQUEST_STATUSES.includes(existingRequest.status)) {
      return { id: existingRequest.id };
    }
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", schedule.equipment_id)
    .maybeSingle<Equipment>();

  if (!equipment) {
    return { error: "Equipment not found" };
  }

  const customer = equipment.customer_id
    ? (
        await supabase
          .from("customers")
          .select("*")
          .eq("id", equipment.customer_id)
          .maybeSingle<Customer>()
      ).data
    : null;

  const contactName = equipment.contact_name ?? customer?.contact_name ?? customer?.name ?? "—";
  const contactPhone = equipment.contact_phone ?? customer?.contact_phone ?? null;
  const contactEmail = customer?.contact_email ?? null;

  const { data: created, error } = await supabase
    .from("service_requests")
    .insert({
      company_id: schedule.company_id,
      equipment_id: schedule.equipment_id,
      customer_id: equipment.customer_id,
      description: `Preventive maintenance: ${schedule.name}${schedule.description ? `\n\n${schedule.description}` : ""}`,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      status: "new",
      priority: "normal",
      source: "pm",
      maintenance_schedule_id: schedule.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) {
    return { error: error?.message ?? "Couldn't create the maintenance request" };
  }

  await supabase.from("maintenance_schedules").update({ last_request_id: created.id }).eq("id", schedule.id);

  return { id: created.id };
}
