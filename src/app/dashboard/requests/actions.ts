"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireActiveSubscription, getEntitlements } from "@/lib/billing";
import { emitRequestActivity } from "@/lib/events";
import { notifyRequesterOfStatus } from "@/lib/email/request-status";
import { buildResolutionEmail } from "@/lib/email/resolution";
import { sendEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import { REQUEST_STATUS_LABELS, REQUEST_PRIORITY_LABELS } from "@/components/status-badge";
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

function revalidateRequest(id: string) {
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  revalidatePath("/dashboard");
}

export async function updateRequestStatus(id: string, status: RequestStatus) {
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
