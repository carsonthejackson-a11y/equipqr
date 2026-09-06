"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireActiveSubscription, getEntitlements } from "@/lib/billing";
import { emitEquipmentEvent, emitRequestActivity } from "@/lib/events";
import { notifyRequesterOfStatus } from "@/lib/email/request-status";
import { buildResolutionEmail } from "@/lib/email/resolution";
import { sendEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import { formatZonedDateTime, zonedDateTimeToIso } from "@/lib/scheduling";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_ORDER,
  REQUEST_PRIORITY_ORDER,
  OPEN_REQUEST_STATUSES,
} from "@/components/status-badge";
import type { Company, Equipment, Profile, RequestPriority, RequestStatus, ServiceRequest } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RequestContext = {
  request: ServiceRequest;
  equipmentName: string;
  company: Company;
};

/**
 * Fetches a request plus its equipment name and company row in one place —
 * every action below needs some subset of this to write an activity row
 * and/or email the requester. RLS scopes all three lookups to the caller's
 * own company, so a bad/foreign id just resolves to null.
 */
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

/**
 * One-call wrapper around notifyRequesterOfStatus() that resolves the
 * caller's plan id (for branding) and the public Supabase URL (for the
 * logo link) so every action below doesn't repeat that boilerplate.
 * Best-effort like the underlying helper — never throws.
 */
async function notifyStatus(
  supabase: SupabaseServerClient,
  ctx: RequestContext,
  status: RequestStatus,
  opts?: { note?: string | null; actorUserId?: string | null }
) {
  const entitlements = await getEntitlements();
  await notifyRequesterOfStatus(supabase, {
    request: ctx.request,
    status,
    equipmentName: ctx.equipmentName,
    company: ctx.company,
    planId: entitlements?.plan_id ?? null,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    note: opts?.note ?? null,
    actorUserId: opts?.actorUserId ?? null,
  });
}

// A server action's arguments come off the wire, so the `RequestStatus` /
// `RequestPriority` annotations below are a compile-time convention, not a
// runtime guarantee. Without these checks an arbitrary string reaches the
// enum column and the caller sees a raw Postgres error
// ("invalid input value for enum request_status: ...") in a toast.
// REQUEST_STATUS_ORDER / REQUEST_PRIORITY_ORDER are the canonical lists —
// never re-declare them here.
function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUS_ORDER as string[]).includes(value);
}

function isRequestPriority(value: unknown): value is RequestPriority {
  return typeof value === "string" && (REQUEST_PRIORITY_ORDER as string[]).includes(value);
}

function revalidateRequest(id: string) {
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  revalidatePath("/dashboard");
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
  if (!isRequestStatus(status)) {
    return { error: "Invalid status" };
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, id);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  const { error } = await supabase.from("service_requests").update({ status }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: id,
    kind: "status_change",
    visibility: "customer",
    body: `Status changed to ${REQUEST_STATUS_LABELS[status]}`,
    authorKind: "staff",
    authorUserId: profile.id,
  });

  await notifyStatus(supabase, ctx, status, { actorUserId: profile.id });

  revalidateRequest(id);
  return { success: true };
}

export async function updateRequestPriority(id: string, priority: RequestPriority) {
  if (!isRequestPriority(priority)) {
    return { error: "Invalid priority" };
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: request } = await supabase
    .from("service_requests")
    .select("company_id")
    .eq("id", id)
    .maybeSingle<Pick<ServiceRequest, "company_id">>();

  if (!request) {
    return { error: "Service request not found" };
  }

  const { error } = await supabase.from("service_requests").update({ priority }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: request.company_id,
    serviceRequestId: id,
    kind: "priority_change",
    visibility: "internal",
    body: `Priority changed to ${REQUEST_PRIORITY_LABELS[priority]}`,
    authorKind: "staff",
    authorUserId: profile.id,
  });

  revalidateRequest(id);
  return { success: true };
}

export async function assignRequest(id: string, userId: string | null) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, id);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  // `userId` comes straight off the wire, and service_requests.assigned_to
  // only has a foreign key to profiles(id) — nothing stops it pointing at
  // another tenant's user, whose first name would then show up on this
  // request's public /r/<token> page. RLS on profiles is company-scoped, so
  // resolving the id first is the ownership check.
  let assigneeName: string | null = null;
  if (userId) {
    const { data: assignee } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle<Pick<Profile, "full_name">>();

    if (!assignee) {
      return { error: "That teammate isn't part of your company" };
    }
    assigneeName = assignee.full_name ?? null;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("service_requests")
    .update({ assigned_to: userId, assigned_at: userId ? now : null })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: id,
    kind: "assignment",
    visibility: userId ? "customer" : "internal",
    body: userId ? `Assigned to ${(assigneeName ?? "a technician").split(" ")[0]}` : "Unassigned",
    authorKind: "staff",
    authorUserId: profile.id,
  });

  // No dedicated "assignment" email template exists yet — reuse the status
  // update email (same status, a short note) so the customer still hears
  // that someone picked up their request.
  if (userId) {
    await notifyStatus(supabase, ctx, ctx.request.status, {
      actorUserId: profile.id,
      note: assigneeName ? `${assigneeName} has been assigned to your request.` : "A technician has been assigned to your request.",
    });
  }

  revalidateRequest(id);
  return { success: true };
}

export async function addRequestNote(id: string, body: string, visibleToCustomer: boolean) {
  const trimmed = body.trim();
  if (!trimmed) {
    return { error: "Note can't be empty" };
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, id);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  const activity = await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: id,
    kind: "note",
    visibility: visibleToCustomer ? "customer" : "internal",
    body: trimmed,
    authorKind: "staff",
    authorUserId: profile.id,
  });

  if (!activity) {
    return { error: "Couldn't save note" };
  }

  if (visibleToCustomer) {
    await notifyStatus(supabase, ctx, ctx.request.status, { actorUserId: profile.id, note: trimmed });
  }

  revalidateRequest(id);
  return { success: true };
}

export async function cancelRequest(id: string, reason: string) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, id);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  const trimmedReason = reason.trim();

  const { error } = await supabase.from("service_requests").update({ status: "canceled" }).eq("id", id);
  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: id,
    kind: "status_change",
    visibility: "customer",
    body: trimmedReason ? `Request canceled: ${trimmedReason}` : "Request canceled",
    authorKind: "staff",
    authorUserId: profile.id,
  });

  await notifyStatus(supabase, ctx, "canceled", {
    actorUserId: profile.id,
    note: trimmedReason || null,
  });

  revalidateRequest(id);
  return { success: true };
}

export async function closeServiceRequest(id: string, formData: FormData) {
  const summary = String(formData.get("summary") ?? "").trim();
  const recommendations = String(formData.get("recommendations") ?? "").trim();
  const sendResolutionEmailFlag = formData.get("sendEmail") === "on";
  const emailTo = String(formData.get("emailTo") ?? "").trim();

  if (!summary) {
    return { error: "Summary of work performed is required" };
  }

  if (sendResolutionEmailFlag && !emailTo) {
    return { error: "Enter an email address, or uncheck emailing the customer" };
  }

  const lockError = await requireActiveSubscription();
  if (lockError) {
    return { error: lockError.error };
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<ServiceRequest>();

  if (!serviceRequest) {
    return { error: "Service request not found" };
  }

  let emailSentAt: string | null = null;

  if (sendResolutionEmailFlag) {
    const [{ data: equipment }, { data: company }] = await Promise.all([
      supabase.from("equipment").select("name").eq("id", serviceRequest.equipment_id).maybeSingle(),
      supabase.from("companies").select("name").eq("id", serviceRequest.company_id).maybeSingle(),
    ]);

    const sent = await sendResolutionEmailTo({
      to: emailTo,
      companyName: company?.name ?? "Your service provider",
      equipmentName: equipment?.name ?? "your equipment",
      contactName: serviceRequest.contact_name,
      summary,
      recommendations,
    });

    if (sent) {
      emailSentAt = new Date().toISOString();
    }
  }

  const { error } = await supabase
    .from("service_requests")
    .update({
      status: "resolved",
      resolution_summary: summary,
      resolution_recommendations: recommendations || null,
      resolved_at: new Date().toISOString(),
      closed_by: profile.id,
      ...(emailSentAt ? { resolution_email_sent_at: emailSentAt } : {}),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: serviceRequest.company_id,
    serviceRequestId: id,
    kind: "status_change",
    visibility: "customer",
    body: "Resolved",
    authorKind: "staff",
    authorUserId: profile.id,
  });

  if (emailSentAt) {
    await emitRequestActivity(supabase, {
      companyId: serviceRequest.company_id,
      serviceRequestId: id,
      kind: "email_sent",
      visibility: "internal",
      body: `Resolution summary emailed to ${emailTo}`,
      metadata: { to: emailTo },
      authorKind: "system",
      authorUserId: profile.id,
    });
  }

  revalidateRequest(id);
  return { success: true, emailSent: !!emailSentAt, emailAttempted: sendResolutionEmailFlag };
}

async function sendResolutionEmailTo(params: {
  to: string;
  companyName: string;
  equipmentName: string;
  contactName: string;
  summary: string;
  recommendations: string;
}) {
  const { subject, html, text } = buildResolutionEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}

// ---------------------------------------------------------------------------
// Scheduling-lite
// ---------------------------------------------------------------------------

const VISIT_NOTE_MAX_LENGTH = 500;
const VISIT_MAX_YEARS_AHEAD = 2;
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;
// <input type="time"> submits HH:MM, or HH:MM:SS when a browser adds seconds.
const TIME_INPUT = /^(\d{2}:\d{2})(?::\d{2})?$/;

/**
 * Books (or re-books) a visit. Wall-clock date/time come off the form in the
 * company's zone and are stored as a UTC instant; every display goes back
 * through formatZonedDateTime() with that zone. Open requests move to
 * `scheduled`; closed ones are refused rather than silently reopened.
 */
export async function scheduleVisit(id: string, formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  const rawTime = String(formData.get("time") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const notifyCustomer = formData.get("notifyCustomer") === "on";

  const timeMatch = TIME_INPUT.exec(rawTime);
  if (!DATE_INPUT.test(date) || !timeMatch) {
    return { error: "Enter a valid date and time" };
  }
  const time = timeMatch[1];

  if (note.length > VISIT_NOTE_MAX_LENGTH) {
    return { error: `Note is too long (${VISIT_NOTE_MAX_LENGTH} characters max)` };
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, id);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  if (!(OPEN_REQUEST_STATUSES as string[]).includes(ctx.request.status)) {
    return { error: "Reopen the request before scheduling a visit" };
  }

  const timezone = ctx.company.timezone;
  const iso = zonedDateTimeToIso(date, time, timezone);
  if (!iso) {
    return { error: "Enter a valid date and time" };
  }

  const limit = new Date();
  limit.setFullYear(limit.getFullYear() + VISIT_MAX_YEARS_AHEAD);
  if (new Date(iso).getTime() > limit.getTime()) {
    return { error: `Visits can't be scheduled more than ${VISIT_MAX_YEARS_AHEAD} years out` };
  }

  const previousScheduledFor = ctx.request.scheduled_for;
  const previousStatus = ctx.request.status;
  const nextStatus: RequestStatus = "scheduled";

  const { error } = await supabase
    .from("service_requests")
    .update({ scheduled_for: iso, status: nextStatus })
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }

  const when = formatZonedDateTime(iso, timezone);
  const verb = previousScheduledFor ? "rescheduled" : "scheduled";
  const summary = `Visit ${verb} for ${when}`;

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: id,
    kind: previousStatus === nextStatus ? "system" : "status_change",
    visibility: "customer",
    body: note ? `${summary} — ${note}` : summary,
    metadata: { scheduled_for: iso, previous_scheduled_for: previousScheduledFor, note: note || null },
    authorKind: "staff",
    authorUserId: profile.id,
  });

  await emitEquipmentEvent(supabase, {
    companyId: ctx.request.company_id,
    equipmentId: ctx.request.equipment_id,
    kind: "visit_scheduled",
    summary,
    details: { scheduled_for: iso, note: note || null, previous_scheduled_for: previousScheduledFor },
    serviceRequestId: id,
    actorUserId: profile.id,
  });

  if (notifyCustomer) {
    await notifyStatus(
      supabase,
      { ...ctx, request: { ...ctx.request, scheduled_for: iso, status: nextStatus } },
      nextStatus,
      { actorUserId: profile.id, note: note || null }
    );
  }

  revalidateRequest(id);
  return { success: true, scheduledFor: iso };
}

/**
 * Removes a booked visit. An open `scheduled` request drops back to
 * `in_progress` and the customer hears about it; on a closed request the
 * visit is just history, so it's cleared quietly.
 */
export async function clearScheduledVisit(id: string) {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const ctx = await loadRequestContext(supabase, id);
  if (!ctx) {
    return { error: "Service request not found" };
  }

  const previousScheduledFor = ctx.request.scheduled_for;
  if (!previousScheduledFor) {
    return { error: "No visit is scheduled" };
  }

  const previousStatus = ctx.request.status;
  const isOpen = (OPEN_REQUEST_STATUSES as string[]).includes(previousStatus);
  const nextStatus: RequestStatus = previousStatus === "scheduled" ? "in_progress" : previousStatus;

  const { error } = await supabase
    .from("service_requests")
    .update({ scheduled_for: null, status: nextStatus })
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }

  const when = formatZonedDateTime(previousScheduledFor, ctx.company.timezone);
  const customerBody = "Visit canceled — we'll be in touch to rebook";

  await emitRequestActivity(supabase, {
    companyId: ctx.request.company_id,
    serviceRequestId: id,
    kind: previousStatus === nextStatus ? "system" : "status_change",
    visibility: isOpen ? "customer" : "internal",
    body: isOpen ? customerBody : `Scheduled visit (${when}) cleared`,
    metadata: { previous_scheduled_for: previousScheduledFor },
    authorKind: "staff",
    authorUserId: profile.id,
  });

  await emitEquipmentEvent(supabase, {
    companyId: ctx.request.company_id,
    equipmentId: ctx.request.equipment_id,
    kind: "visit_canceled",
    summary: `Visit for ${when} canceled`,
    details: { previous_scheduled_for: previousScheduledFor },
    serviceRequestId: id,
    actorUserId: profile.id,
  });

  if (isOpen) {
    await notifyStatus(
      supabase,
      { ...ctx, request: { ...ctx.request, scheduled_for: null, status: nextStatus } },
      nextStatus,
      { actorUserId: profile.id, note: customerBody }
    );
  }

  revalidateRequest(id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Two-way messaging (inbox side)
// ---------------------------------------------------------------------------

/**
 * Stamps customer_messages_read_at when staff open a request that has an
 * unread customer reply. Called from a client effect on the detail page
 * (server components must not write during render). Best-effort: it's a
 * read marker, not a domain change, so it leaves no activity row.
 */
export async function markCustomerMessagesRead(id: string, seenAt: string) {
  if (typeof id !== "string" || !id) {
    return { error: "Invalid request" };
  }
  // The read marker is the timestamp of the latest reply the page actually
  // rendered — never "now", or a reply landing between render and this call
  // would be marked read unseen.
  if (typeof seenAt !== "string" || Number.isNaN(new Date(seenAt).getTime())) {
    return { error: "Invalid request" };
  }

  const supabase = await createClient();
  await getCurrentProfile();

  const { error } = await supabase
    .from("service_requests")
    .update({ customer_messages_read_at: new Date(seenAt).toISOString() })
    .eq("id", id)
    .not("last_customer_message_at", "is", null);

  if (error) {
    return { error: error.message };
  }

  // Drop the inbox's cached copy so its unread dot clears on the way back.
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard");
  return { success: true };
}
