"use server";

// Scheduling-lite: set/clear a visit date+time on a service request. Lives
// next to (not inside) requests/actions.ts, which belongs to workstream B —
// see docs/NEXT-ROADMAP-BRIEF.md's workstream C row.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing";
import { emitEquipmentEvent, emitRequestActivity } from "@/lib/events";
import { notifyRequesterOfStatus } from "@/lib/email/request-status";
import { buildAssigneeNotificationEmail } from "@/lib/email/assignment";
import { sendEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import { formatZonedDateTime } from "@/lib/schedule";
import { formatCompanyLongDateTime, DEFAULT_COMPANY_TIME_ZONE } from "@/lib/format";
import { getEquipmentPublicUrl } from "@/lib/qr";
import { pickBestCode } from "@/lib/qr-codes";
import type { Company, CompanyMember, Customer, Equipment, Location, QrCode, ServiceRequest } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Statuses a visit may move a request out of when it's scheduled. Anything past this (resolved/canceled/already-scheduled) is left alone. */
const SCHEDULABLE_FROM: ServiceRequest["status"][] = ["new", "in_progress", "on_hold"];

type RequestContext = { request: ServiceRequest; equipmentName: string; company: Company };

async function loadRequestContext(supabase: SupabaseServerClient, id: string): Promise<RequestContext | null> {
  const { data: request } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<ServiceRequest>();

  if (!request) return null;

  const [{ data: equipment }, { data: company }] = await Promise.all([
    supabase
      .from("equipment")
      .select("name")
      .eq("id", request.equipment_id)
      .maybeSingle<Pick<Equipment, "name">>(),
    supabase.from("companies").select("*").eq("id", request.company_id).maybeSingle<Company>(),
  ]);

  if (!company) return null;
  return { request, equipmentName: equipment?.name ?? "your equipment", company };
}

function revalidateRequest(id: string) {
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
}

/**
 * Resolves the site/customer label, address and a staff-scan link for one
 * request's equipment — everything buildAssigneeNotificationEmail() needs
 * beyond the request/company fields the caller already has. Vocab-aware
 * (customer for service_provider, location for equipment_owner — C1-44).
 * Never throws; a lookup failure just means a thinner (still honest) email.
 * Kept in sync with the identical helper in requests/actions.ts (QoL-4 owns
 * that file save for its email hunks, so this one isn't shared across them).
 */
async function resolveAssigneeEmailContext(
  supabase: SupabaseServerClient,
  companyKind: Company["kind"],
  equipmentId: string
): Promise<{ siteName: string | null; address: string | null; staffScanUrl: string | null }> {
  const [{ data: equipment }, { data: codes }] = await Promise.all([
    supabase
      .from("equipment")
      .select("address, customer_id, location_id")
      .eq("id", equipmentId)
      .maybeSingle<Pick<Equipment, "address" | "customer_id" | "location_id">>(),
    supabase
      .from("qr_codes")
      .select("token, status, equipment_id")
      .eq("equipment_id", equipmentId)
      .returns<Pick<QrCode, "token" | "status" | "equipment_id">[]>(),
  ]);

  let siteName: string | null = null;
  let address = equipment?.address ?? null;

  if (companyKind === "equipment_owner" && equipment?.location_id) {
    const { data: location } = await supabase
      .from("locations")
      .select("name, address")
      .eq("id", equipment.location_id)
      .maybeSingle<Pick<Location, "name" | "address">>();
    siteName = location?.name ?? null;
    address = address || (location?.address ?? null);
  } else if (equipment?.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("name, address")
      .eq("id", equipment.customer_id)
      .maybeSingle<Pick<Customer, "name" | "address">>();
    siteName = customer?.name ?? null;
    address = address || (customer?.address ?? null);
  }

  const best = pickBestCode(codes ?? []);
  const staffScanUrl = best ? getEquipmentPublicUrl(best.token) : null;

  return { siteName, address, staffScanUrl };
}

/**
 * Emails the ASSIGNED TECHNICIAN that their visit was scheduled/rescheduled
 * (C1-44). Best-effort and silent on any failure, mirroring every other
 * staff notification in this codebase.
 */
async function notifyAssigneeOfSchedule(
  supabase: SupabaseServerClient,
  ctx: RequestContext,
  scheduledForIso: string,
  actorUserId: string
): Promise<void> {
  const assigneeId = ctx.request.assigned_to;
  // No email about your own booking — a solo owner assigned to every job
  // would otherwise get one each time they schedule a visit.
  if (!assigneeId || assigneeId === actorUserId) return;

  try {
    const { data: members } = await supabase.rpc("get_company_members");
    const assignee = ((members as CompanyMember[] | null) ?? []).find((m) => m.id === assigneeId);
    if (!assignee) return;

    const { siteName, address, staffScanUrl } = await resolveAssigneeEmailContext(
      supabase,
      ctx.company.kind,
      ctx.request.equipment_id
    );

    const { subject, html, text } = buildAssigneeNotificationEmail({
      reason: "scheduled",
      technicianName: assignee.full_name,
      equipmentName: ctx.equipmentName,
      siteName,
      address,
      whenText: formatCompanyLongDateTime(scheduledForIso, ctx.company.timezone ?? DEFAULT_COMPANY_TIME_ZONE),
      staffScanUrl,
      requestUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${ctx.request.id}`,
    });

    await sendEmail({ to: assignee.email, subject, html, text });
  } catch (err) {
    console.error("notifyAssigneeOfSchedule failed:", err);
  }
}

export type ScheduleVisitInput = {
  /** UTC ISO instant — build it with zonedWallTimeToUtcIso() from the company-timezone form fields. */
  scheduledFor: string;
  durationMinutes: number;
};

export async function scheduleVisit(requestId: string, input: ScheduleVisitInput) {
  const scheduledDate = new Date(input.scheduledFor);
  if (Number.isNaN(scheduledDate.getTime())) {
    return { error: "That doesn't look like a valid date/time" };
  }
  const durationMinutes = Math.round(input.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 1440) {
    return { error: "Duration must be between 5 minutes and 24 hours" };
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, requestId);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  const scheduledForIso = scheduledDate.toISOString();
  const timeChanged = ctx.request.scheduled_for !== scheduledForIso;
  const nextStatus = SCHEDULABLE_FROM.includes(ctx.request.status) ? "scheduled" : ctx.request.status;

  const { error } = await supabase
    .from("service_requests")
    .update({
      scheduled_for: scheduledForIso,
      scheduled_duration_minutes: durationMinutes,
      status: nextStatus,
      // A changed time invalidates any reminder already sent for the old one.
      ...(timeChanged ? { reminder_sent_at: null } : {}),
    })
    .eq("id", requestId);

  if (error) {
    return { error: error.message };
  }

  const when = formatZonedDateTime(scheduledForIso, ctx.company.timezone);

  await emitEquipmentEvent(supabase, {
    companyId: ctx.request.company_id,
    equipmentId: ctx.request.equipment_id,
    kind: "visit_scheduled",
    summary: `Visit scheduled for ${when}`,
    details: { service_request_id: requestId, scheduled_for: scheduledForIso, duration_minutes: durationMinutes },
    serviceRequestId: requestId,
    actorUserId: profile.id,
  });

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: requestId,
    kind: "status_change",
    visibility: "customer",
    body: `Visit scheduled for ${when}`,
    authorKind: "staff",
    authorUserId: profile.id,
  });

  const entitlements = await getEntitlements();
  const notified = await notifyRequesterOfStatus(supabase, {
    request: { ...ctx.request, scheduled_for: scheduledForIso },
    status: "scheduled",
    equipmentName: ctx.equipmentName,
    company: ctx.company,
    planId: entitlements?.plan_id ?? null,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    actorUserId: profile.id,
  });

  // Tell the technician too (C1-44) — every reschedule, not just the first
  // time, since a moved visit is exactly the kind of change they need to
  // actually see before they show up at the old time.
  await notifyAssigneeOfSchedule(supabase, ctx, scheduledForIso, profile.id);

  revalidateRequest(requestId);
  return { success: true, notified };
}

export async function clearVisit(requestId: string) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, requestId);
  if (!ctx) {
    return { error: "Service request not found" };
  }
  if (!ctx.request.scheduled_for) {
    return { success: true };
  }

  // A cleared visit on an otherwise-open request goes back to "in progress"
  // rather than sitting on "scheduled" with nothing scheduled.
  const nextStatus = ctx.request.status === "scheduled" ? "in_progress" : ctx.request.status;

  const { error } = await supabase
    .from("service_requests")
    .update({ scheduled_for: null, reminder_sent_at: null, status: nextStatus })
    .eq("id", requestId);

  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: requestId,
    kind: "note",
    visibility: "internal",
    body: "Scheduled visit removed",
    authorKind: "staff",
    authorUserId: profile.id,
  });

  revalidateRequest(requestId);
  return { success: true };
}

/**
 * Marks a scheduled visit as having happened without resolving the whole
 * request (e.g. a diagnostic visit ahead of a parts-order follow-up). Emits
 * `visit_completed` on the unit's timeline; leaves status untouched (use the
 * existing status control or close-out flow to resolve the request itself).
 */
export async function markVisitCompleted(requestId: string) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, requestId);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  await emitEquipmentEvent(supabase, {
    companyId: ctx.request.company_id,
    equipmentId: ctx.request.equipment_id,
    kind: "visit_completed",
    summary: "Visit completed",
    serviceRequestId: requestId,
    actorUserId: profile.id,
  });

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: requestId,
    kind: "note",
    visibility: "internal",
    body: "Visit marked completed",
    authorKind: "staff",
    authorUserId: profile.id,
  });

  revalidateRequest(requestId);
  return { success: true };
}
