"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireActiveSubscription, getEntitlements } from "@/lib/billing";
import { emitEquipmentEvent, emitRequestActivity } from "@/lib/events";
import { brandingForEmail, buildRequestReceivedEmail, notifyRequesterOfStatus } from "@/lib/email/request-status";
import { buildResolutionEmail } from "@/lib/email/resolution";
import { sendEmail } from "@/lib/email/send";
import { sendCompanyEmail } from "@/lib/email/company-email";
import { publicEnv } from "@/lib/env";
import { getRequestStatusUrl } from "@/lib/qr";
import { vocabFor } from "@/lib/vocab";
import { zonedWallTimeToUtcIso } from "@/lib/schedule";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_ORDER,
  REQUEST_PRIORITY_ORDER,
} from "@/components/status-badge";
import { firstStaffRequestIssue, parseStaffRequestEquipmentQuery, staffRequestSchema } from "./staff-request";
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

// ============================================================================
// Log a phone-in request (Q-28, C1-26) — "New request" / "New work order" on
// the inbox, equipment detail and customer detail. Kept as new, standalone
// functions (createStaffRequest, searchEquipmentForRequest) rather than
// folded into the actions above, per the brief: QoL-1 owns the
// email-sending hunks already in this file, so this addition reuses their
// builders (buildRequestReceivedEmail, brandingForEmail) instead of touching
// notifyStatus()/closeServiceRequest()'s own email calls.
// ============================================================================

export type EquipmentSearchResult = {
  id: string;
  name: string;
  serialNumber: string | null;
  /** Free-text "location within site" (equipment.location) — distinct from location_id. */
  location: string | null;
  customerId: string | null;
  customerName: string | null;
};

/**
 * Unit search for the New-request picker: name/serial substring match, OR'd
 * with an exact short-code match when the typed term looks like one (Q-31's
 * "equipment search should match sticker short codes" rule, reused here).
 * RLS scopes every lookup to the caller's own company. Returns at most 20
 * matches, ordered by name.
 */
export async function searchEquipmentForRequest(term: string): Promise<EquipmentSearchResult[]> {
  const parsed = parseStaffRequestEquipmentQuery(term);
  if (!parsed.term && !parsed.shortCode) return [];

  const supabase = await createClient();

  let codeMatchIds: string[] = [];
  if (parsed.shortCode) {
    const { data: codes } = await supabase
      .from("qr_codes")
      .select("equipment_id")
      .eq("short_code", parsed.shortCode)
      .not("equipment_id", "is", null)
      .returns<{ equipment_id: string | null }[]>();
    codeMatchIds = (codes ?? []).flatMap((c) => (c.equipment_id ? [c.equipment_id] : []));
  }

  let query = supabase
    .from("equipment")
    .select("id, name, serial_number, location, customer_id")
    .order("name")
    .limit(20);

  if (parsed.term) {
    const escaped = parsed.term.replace(/[%_]/g, (m) => `\\${m}`).replace(/,/g, "");
    const clauses = [`name.ilike.%${escaped}%`, `serial_number.ilike.%${escaped}%`];
    if (codeMatchIds.length > 0) clauses.push(`id.in.(${codeMatchIds.join(",")})`);
    query = query.or(clauses.join(","));
  } else if (codeMatchIds.length > 0) {
    query = query.in("id", codeMatchIds);
  } else {
    return [];
  }

  const { data: equipment } = await query.returns<
    Pick<Equipment, "id" | "name" | "serial_number" | "location" | "customer_id">[]
  >();
  if (!equipment || equipment.length === 0) return [];

  const customerIds = [...new Set(equipment.flatMap((e) => (e.customer_id ? [e.customer_id] : [])))];
  const { data: customers } =
    customerIds.length > 0
      ? await supabase.from("customers").select("id, name").in("id", customerIds).returns<{ id: string; name: string }[]>()
      : { data: [] as { id: string; name: string }[] };
  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  return equipment.map((e) => ({
    id: e.id,
    name: e.name,
    serialNumber: e.serial_number,
    location: e.location,
    customerId: e.customer_id,
    customerName: e.customer_id ? (customerNameById.get(e.customer_id) ?? null) : null,
  }));
}

export type StaffRequestContactDefaults = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
};

/** Prefills the New-request sheet's contact fields once a unit is picked — the unit's own on-site contact first, falling back to its linked customer, mirroring resolveVisitContact()'s preference order for "log a visit" (src/lib/staff-scan.ts). */
export async function getStaffRequestContactDefaults(equipmentId: string): Promise<StaffRequestContactDefaults> {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("contact_name, contact_phone, customer_id")
    .eq("id", equipmentId)
    .eq("company_id", profile.company_id)
    .maybeSingle<Pick<Equipment, "contact_name" | "contact_phone" | "customer_id">>();

  if (!equipment) return { contactName: "", contactEmail: "", contactPhone: "" };

  let customer: { name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null = null;
  if (equipment.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("name, contact_name, contact_email, contact_phone")
      .eq("id", equipment.customer_id)
      .maybeSingle();
    customer = data ?? null;
  }

  return {
    contactName: equipment.contact_name?.trim() || customer?.contact_name?.trim() || customer?.name?.trim() || "",
    contactEmail: customer?.contact_email?.trim() || "",
    contactPhone: equipment.contact_phone?.trim() || customer?.contact_phone?.trim() || "",
  };
}

export type CreateStaffRequestResult = { error: string } | { success: true; id: string; statusEmailSent: boolean };

/**
 * Logs a request from the office — a call, an email, someone stopping by —
 * that has no public scan behind it. Mirrors createVisitRequest()'s
 * ("log a visit", src/app/e/[qrToken]/staff-actions.ts) shape: `source:
 * "staff"` (0020's RLS already allows a staff insert), the same
 * request_submitted equipment event. Unlike that action, this one ALSO
 * writes the customer-visible "Request received" activity row the public
 * scan path writes and createVisitRequest doesn't — an office-logged
 * request should show the same opening line on the customer's /r/<token>
 * page as one they submitted themselves.
 */
export async function createStaffRequest(formData: FormData): Promise<CreateStaffRequestResult> {
  const parsed = staffRequestSchema.safeParse({
    equipmentId: formData.get("equipmentId"),
    description: formData.get("description"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    priority: formData.get("priority") || undefined,
    scheduleDate: formData.get("scheduleDate"),
    scheduleTime: formData.get("scheduleTime"),
    sendStatusEmail: formData.get("sendStatusEmail") === "on",
  });

  if (!parsed.success) {
    return { error: firstStaffRequestIssue(parsed.error) };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", input.equipmentId)
    .eq("company_id", profile.company_id)
    .maybeSingle<Equipment>();

  if (!equipment) {
    return { error: "That unit couldn't be found" };
  }

  const scheduledFor = input.scheduleDate
    ? zonedWallTimeToUtcIso(input.scheduleDate, input.scheduleTime || "09:00", company.timezone)
    : null;

  const { data: inserted, error } = await supabase
    .from("service_requests")
    .insert({
      company_id: profile.company_id,
      equipment_id: equipment.id,
      customer_id: equipment.customer_id,
      location_id: equipment.location_id,
      description: input.description,
      contact_name: input.contactName,
      contact_email: input.contactEmail || null,
      contact_phone: input.contactPhone || null,
      status: scheduledFor ? "scheduled" : "new",
      priority: input.priority,
      source: "staff",
      scheduled_for: scheduledFor,
    })
    .select("id, public_token")
    .single<{ id: string; public_token: string }>();

  if (error || !inserted) {
    return { error: error?.message ?? "Couldn't log this request" };
  }

  const vocab = vocabFor(company.kind);
  const loggedByFirstName = profile.full_name?.trim()?.split(" ")[0] || "staff";

  await Promise.all([
    emitEquipmentEvent(supabase, {
      companyId: profile.company_id,
      equipmentId: equipment.id,
      kind: "request_submitted",
      summary: `${vocab.requestSingular} logged by ${loggedByFirstName}`,
      serviceRequestId: inserted.id,
      actorKind: "staff",
      actorUserId: profile.id,
    }),
    emitRequestActivity(supabase, {
      companyId: profile.company_id,
      serviceRequestId: inserted.id,
      kind: "status_change",
      visibility: "customer",
      body: "Request received",
      authorKind: "staff",
      authorUserId: profile.id,
    }),
  ]);

  let statusEmailSent = false;
  if (input.sendStatusEmail && input.contactEmail) {
    if (company.customer_updates_enabled) {
      const entitlements = await getEntitlements();
      const brand = brandingForEmail({
        company,
        planId: entitlements?.plan_id ?? null,
        supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      });
      const { subject, html, text } = buildRequestReceivedEmail({
        brand,
        equipmentName: equipment.name,
        contactName: input.contactName,
        statusUrl: getRequestStatusUrl(inserted.public_token),
      });
      const sent = await sendCompanyEmail({ company, to: input.contactEmail, subject, html, text });
      statusEmailSent = sent.sent;
    }

    if (statusEmailSent) {
      await emitRequestActivity(supabase, {
        companyId: profile.company_id,
        serviceRequestId: inserted.id,
        kind: "email_sent",
        visibility: "internal",
        body: `Status link emailed to ${input.contactEmail}`,
        metadata: { to: input.contactEmail },
        authorKind: "system",
        authorUserId: profile.id,
      });
    }
  }

  revalidateRequest(inserted.id);
  revalidatePath(`/dashboard/equipment/${equipment.id}`);
  if (equipment.customer_id) revalidatePath(`/dashboard/customers/${equipment.customer_id}`);
  revalidatePath("/dashboard/today");

  return { success: true, id: inserted.id, statusEmailSent };
}
