"use server";

// Server actions for staff scan mode (`/e/[qrToken]/staff/**`). The
// bread-and-butter mutations — set status, assign to me, add a note — are
// already exported from `@/app/dashboard/requests/actions` and are safe to
// call straight from a client component here (see NEXT-ROADMAP-BRIEF.md);
// this file only holds what's specific to a technician standing at the
// machine: "On my way", the phone close-out flow, and logging a visit that
// has no open request behind it yet.
//
// Every action re-derives the request/equipment from the DB scoped to the
// caller's own company (`getCurrentProfile()` + an explicit
// `.eq("company_id", ...)` on top of RLS) before writing anything, per the
// brief's "verify the request belongs to the profile's company" rule.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { requireActiveSubscription, getEntitlements } from "@/lib/billing";
import { emitEquipmentEvent, emitRequestActivity } from "@/lib/events";
import { notifyRequesterOfStatus, brandingForEmail } from "@/lib/email/request-status";
import { buildResolutionEmail } from "@/lib/email/resolution";
import { sendCompanyEmail } from "@/lib/email/company-email";
import { publicEnv } from "@/lib/env";
import { vocabFor } from "@/lib/vocab";
import {
  clampEtaMinutes,
  firstNameOf,
  formatOnMyWayNote,
  isOwnedStaffMediaPath,
  resolveVisitContact,
  validateCloseOut,
} from "@/lib/staff-scan";
import { CLOSED_REQUEST_STATUSES, REQUEST_STATUS_LABELS } from "@/components/status-badge";
import type { Customer, Equipment, ServiceRequest } from "@/lib/types";

type ActionResult<T = unknown> = { error: string } | ({ success: true } & T);

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function revalidateStaffSurfaces(qrToken: string, requestId?: string) {
  // The scan page is what the technician is actually looking at; the
  // dashboard routes are revalidated too so anyone viewing the request from
  // a desktop sees the same update without a manual refresh.
  revalidatePath(`/e/${qrToken}`, "page");
  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard");
  if (requestId) revalidatePath(`/dashboard/requests/${requestId}`);
}

/** Loads a request, scoped to the caller's own company — never trust a request id off the wire. */
async function loadOwnedRequest(
  supabase: SupabaseServerClient,
  requestId: string,
  companyId: string
): Promise<ServiceRequest | null> {
  const { data } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .eq("company_id", companyId)
    .maybeSingle<ServiceRequest>();
  return data ?? null;
}

// ============================================================================
// "On my way"
// ============================================================================

/**
 * "Which channel actually told the requester?" — C1-31/Q-03: the toast used
 * to claim "Customer notified" unconditionally. `"email"` means
 * notifyRequesterOfStatus() actually sent one (it already returns `false`
 * for a phone-only reporter, `customer_updates_enabled=false`, or any
 * owner-kind request, whose `contact_email` is always null); `"none"` means
 * the caller should offer the tech's-own-phone SMS/Call fallback instead.
 */
export type OnMyWayChannel = "email" | "none";

/**
 * Stamps `on_my_way_sent_at`, appends a customer-visible activity note, and
 * emails the requester the same way any other status note does — there's no
 * separate "on my way" template (see `src/lib/email/request-status.ts`):
 * `notifyRequesterOfStatus` already renders the current status line plus an
 * optional note, and "<Name> is on the way — ETA ~N min" reads fine as that
 * note without a new email needing to exist.
 *
 * Also applies the QoL brief's §2 shared default: an unassigned request gets
 * assigned to the tech who tapped this, and `new`/`scheduled` moves to
 * `in_progress` — "on my way" is a commitment to the job, so the record
 * should say so.
 */
export async function sendOnMyWay(
  qrToken: string,
  requestId: string,
  etaMinutes: number
): Promise<ActionResult<{ channel: OnMyWayChannel }>> {
  // C1-33: checked before any write, not just at close-out — a locked
  // provider's staff scan mode should stop here, not after the fact.
  const lockError = await requireActiveSubscription();
  if (lockError) {
    return lockError;
  }

  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const request = await loadOwnedRequest(supabase, requestId, profile.company_id);
  if (!request) {
    return { error: "Service request not found" };
  }
  // A stale page or a direct call must not reassign a closed job or email
  // its customer that someone is on the way.
  if ((CLOSED_REQUEST_STATUSES as readonly string[]).includes(request.status)) {
    return { error: "This request is already closed" };
  }

  const eta = clampEtaMinutes(etaMinutes);
  const note = formatOnMyWayNote(profile.full_name ?? "", eta);
  const nowIso = new Date().toISOString();

  const shouldAssign = !request.assigned_to;
  const shouldAdvanceStatus = request.status === "new" || request.status === "scheduled";

  const { error } = await supabase
    .from("service_requests")
    .update({
      on_my_way_sent_at: nowIso,
      ...(shouldAssign ? { assigned_to: profile.id, assigned_at: nowIso } : {}),
      ...(shouldAdvanceStatus ? { status: "in_progress" } : {}),
    })
    .eq("id", requestId);
  if (error) {
    return { error: error.message };
  }

  await emitRequestActivity(supabase, {
    companyId: request.company_id,
    serviceRequestId: requestId,
    kind: "note",
    visibility: "customer",
    body: note,
    authorKind: "staff",
    authorUserId: profile.id,
  });

  // Internal-only records of the two side effects above — the customer-
  // visible "on the way" note already covers what the requester needs to
  // hear; these are for the request's own activity history (parity with
  // assignRequest()/updateRequestStatus() in the dashboard's requests/actions.ts).
  if (shouldAssign) {
    await emitRequestActivity(supabase, {
      companyId: request.company_id,
      serviceRequestId: requestId,
      kind: "assignment",
      visibility: "internal",
      body: `Assigned to ${firstNameOf(profile.full_name, "you")} (On my way)`,
      authorKind: "staff",
      authorUserId: profile.id,
    });
  }
  if (shouldAdvanceStatus) {
    await emitRequestActivity(supabase, {
      companyId: request.company_id,
      serviceRequestId: requestId,
      kind: "status_change",
      visibility: "internal",
      body: `Status changed to ${REQUEST_STATUS_LABELS.in_progress} (On my way)`,
      authorKind: "staff",
      authorUserId: profile.id,
    });
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("name")
    .eq("id", request.equipment_id)
    .maybeSingle<Pick<Equipment, "name">>();

  const entitlements = await getEntitlements();
  const emailSent = await notifyRequesterOfStatus(supabase, {
    request,
    status: shouldAdvanceStatus ? "in_progress" : request.status,
    equipmentName: equipment?.name ?? "your equipment",
    company,
    planId: entitlements?.plan_id ?? null,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    note,
    actorUserId: profile.id,
  });

  revalidateStaffSurfaces(qrToken, requestId);
  return { success: true, channel: emailSent ? "email" : "none" };
}

// ============================================================================
// Close-out from the phone
// ============================================================================

export type CloseOutMediaInput = {
  /** Storage object already uploaded by the client to `service-request-media`. */
  path: string;
  caption: string;
};

export type CloseOutFromScanInput = {
  summary: string;
  recommendations: string;
  /** Before/after photos, already uploaded client-side (see close-out-dialog.tsx). */
  media: CloseOutMediaInput[];
  /** Signature PNG already uploaded client-side, or null if the customer didn't sign. */
  signaturePath: string | null;
  signedByName: string | null;
  sendEmail: boolean;
  emailTo: string;
};

/**
 * Pre-flight lock check the close-out dialog calls BEFORE starting any
 * photo/signature upload (C1-33). Uploads go straight from the browser to
 * Storage — closeOutFromScan's own requireActiveSubscription() check below
 * still runs, as a backstop, but on its own it would only fire after a
 * locked company's files were already sitting in Storage. Exported
 * separately (rather than folded into closeOutFromScan) so the dialog can
 * ask "am I allowed to start?" up front.
 */
export async function assertStaffUploadsAllowed(): Promise<{ error: string } | null> {
  return requireActiveSubscription();
}

/**
 * The phone equivalent of `closeServiceRequest` (dashboard). Kept as a
 * sibling action rather than reusing that one's FormData signature because
 * this flow also attaches staff media rows and an optional signature — but
 * it reuses the same email builder (`buildResolutionEmail`) and sets exactly
 * the same resolution columns, so both surfaces produce identical results.
 */
export async function closeOutFromScan(
  qrToken: string,
  requestId: string,
  input: CloseOutFromScanInput
): Promise<ActionResult<{ emailSent: boolean; emailAttempted: boolean }>> {
  const summary = input.summary.trim();
  const recommendations = input.recommendations.trim();
  const emailTo = input.emailTo.trim();

  const validationError = validateCloseOut({ summary, sendEmail: input.sendEmail, emailTo });
  if (validationError) {
    return { error: validationError };
  }

  const lockError = await requireActiveSubscription();
  if (lockError) {
    return { error: lockError.error };
  }

  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const request = await loadOwnedRequest(supabase, requestId, profile.company_id);
  if (!request) {
    return { error: "Service request not found" };
  }

  // The uploads happened in the browser, so these paths are caller-supplied:
  // pin them to this company's own staff prefix for this request before any
  // of them becomes a media row (see isOwnedStaffMediaPath's note on the
  // 0001 storage read policy). Migration 0019 enforces the same rule in RLS.
  const badPath =
    input.media.find((item) => !isOwnedStaffMediaPath(item.path, profile.company_id, requestId)) ??
    (input.signaturePath && !isOwnedStaffMediaPath(input.signaturePath, profile.company_id, requestId)
      ? { path: input.signaturePath }
      : null);
  if (badPath) {
    return { error: "Those uploads couldn't be verified — please retry the close-out." };
  }

  if (input.media.length > 0) {
    const rows = input.media.map((item) => ({
      service_request_id: requestId,
      storage_path: item.path,
      media_type: "image" as const,
      origin: "staff" as const,
      caption: item.caption || null,
      uploaded_by: profile.id,
      company_id: profile.company_id,
    }));
    const { error: mediaError } = await supabase.from("service_request_media").insert(rows);
    if (mediaError) {
      return { error: `Photos couldn't be saved: ${mediaError.message}` };
    }
  }

  let emailSentAt: string | null = null;
  if (input.sendEmail) {
    const [{ data: equipment }, entitlements] = await Promise.all([
      supabase.from("equipment").select("name").eq("id", request.equipment_id).maybeSingle<Pick<Equipment, "name">>(),
      getEntitlements(),
    ]);

    const { subject, html, text } = buildResolutionEmail({
      brand: brandingForEmail({
        company,
        planId: entitlements?.plan_id ?? null,
        supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      }),
      requestNoun: vocabFor(company.kind).requestSingular.toLowerCase(),
      equipmentName: equipment?.name ?? "your equipment",
      contactName: request.contact_name,
      summary,
      recommendations,
    });

    const { sent } = await sendCompanyEmail({
      company: { name: company.name, notification_email: company.notification_email },
      to: emailTo,
      subject,
      html,
      text,
    });
    if (sent) {
      emailSentAt = new Date().toISOString();
    }
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("service_requests")
    .update({
      status: "resolved",
      resolution_summary: summary,
      resolution_recommendations: recommendations || null,
      resolved_at: nowIso,
      closed_by: profile.id,
      ...(input.signaturePath
        ? { signature_path: input.signaturePath, signed_by_name: input.signedByName, signed_at: nowIso }
        : {}),
      ...(emailSentAt ? { resolution_email_sent_at: emailSentAt } : {}),
    })
    .eq("id", requestId);

  if (error) {
    return { error: error.message };
  }

  // The `request_resolved` equipment event and `last_serviced_at` bump are
  // written by the 0013 `service_requests_on_resolved` trigger on this same
  // update — nothing to do here beyond the request's own activity feed.
  await emitRequestActivity(supabase, {
    companyId: request.company_id,
    serviceRequestId: requestId,
    kind: "status_change",
    visibility: "customer",
    body: "Resolved",
    authorKind: "staff",
    authorUserId: profile.id,
  });

  if (emailSentAt) {
    await emitRequestActivity(supabase, {
      companyId: request.company_id,
      serviceRequestId: requestId,
      kind: "email_sent",
      visibility: "internal",
      body: `Resolution summary emailed to ${emailTo}`,
      metadata: { to: emailTo },
      authorKind: "system",
      authorUserId: profile.id,
    });
  }

  revalidateStaffSurfaces(qrToken, requestId);
  return { success: true, emailSent: !!emailSentAt, emailAttempted: input.sendEmail };
}

// ============================================================================
// "Log a visit" — no open request on this unit
// ============================================================================

/**
 * Design choice (brief leaves this open): a "logged visit" becomes a real
 * `source: 'staff'` service request, created `new` and immediately walked
 * into the same close-out flow as any other request, rather than a bare
 * `equipment_events` row. That means it gets everything a request already
 * has for free — the media gallery, the signature columns, the resolution
 * email, and a place in reporting/history — instead of a second, thinner
 * code path. If the technician backs out before finishing the close-out,
 * the request is simply left `new` and reappears in "Open requests" next
 * time anyone scans the sticker, rather than being lost.
 */
export async function createVisitRequest(
  qrToken: string,
  equipmentId: string
): Promise<
  ActionResult<{ requestId: string; contactName: string; contactEmail: string | null; contactPhone: string | null; publicToken: string }>
> {
  // C1-33: a locked company shouldn't be able to open a brand-new close-out
  // flow, same as sendOnMyWay/closeOutFromScan.
  const lockError = await requireActiveSubscription();
  if (lockError) {
    return lockError;
  }

  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", equipmentId)
    .eq("company_id", profile.company_id)
    .maybeSingle<Equipment>();
  if (!equipment) {
    return { error: "Equipment not found" };
  }

  let customer: Customer | null = null;
  if (equipment.customer_id) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("id", equipment.customer_id)
      .maybeSingle<Customer>();
    customer = data ?? null;
  }

  const contact = resolveVisitContact(equipment, customer);

  const { data: inserted, error } = await supabase
    .from("service_requests")
    .insert({
      company_id: profile.company_id,
      equipment_id: equipmentId,
      customer_id: equipment.customer_id,
      description: "Visit logged by technician from the field.",
      contact_name: contact.contactName,
      contact_email: contact.contactEmail,
      contact_phone: contact.contactPhone,
      status: "new",
      priority: "normal",
      source: "staff",
    })
    .select("id, public_token")
    .single<{ id: string; public_token: string }>();

  if (error || !inserted) {
    return { error: error?.message ?? "Couldn't log this visit" };
  }

  await emitEquipmentEvent(supabase, {
    companyId: profile.company_id,
    equipmentId,
    kind: "request_submitted",
    summary: "Visit logged by technician",
    serviceRequestId: inserted.id,
    actorKind: "staff",
    actorUserId: profile.id,
  });

  revalidateStaffSurfaces(qrToken, inserted.id);
  return {
    success: true,
    requestId: inserted.id,
    contactName: contact.contactName,
    contactEmail: contact.contactEmail,
    contactPhone: contact.contactPhone,
    publicToken: inserted.public_token,
  };
}
