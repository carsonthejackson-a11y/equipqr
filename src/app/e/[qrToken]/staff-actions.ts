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
import { notifyRequesterOfStatus } from "@/lib/email/request-status";
import { buildResolutionEmail } from "@/lib/email/resolution";
import { sendEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import {
  clampEtaMinutes,
  formatOnMyWayNote,
  isOwnedStaffMediaPath,
  resolveVisitContact,
  validateCloseOut,
} from "@/lib/staff-scan";
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
 * Stamps `on_my_way_sent_at`, appends a customer-visible activity note, and
 * emails the requester the same way any other status note does — there's no
 * separate "on my way" template (see `src/lib/email/request-status.ts`):
 * `notifyRequesterOfStatus` already renders the current status line plus an
 * optional note, and "<Name> is on the way — ETA ~N min" reads fine as that
 * note without a new email needing to exist.
 */
export async function sendOnMyWay(qrToken: string, requestId: string, etaMinutes: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const request = await loadOwnedRequest(supabase, requestId, profile.company_id);
  if (!request) {
    return { error: "Service request not found" };
  }

  const eta = clampEtaMinutes(etaMinutes);
  const note = formatOnMyWayNote(profile.full_name ?? "", eta);
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("service_requests")
    .update({ on_my_way_sent_at: nowIso })
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

  const { data: equipment } = await supabase
    .from("equipment")
    .select("name")
    .eq("id", request.equipment_id)
    .maybeSingle<Pick<Equipment, "name">>();

  const entitlements = await getEntitlements();
  await notifyRequesterOfStatus(supabase, {
    request,
    status: request.status,
    equipmentName: equipment?.name ?? "your equipment",
    company,
    planId: entitlements?.plan_id ?? null,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    note,
    actorUserId: profile.id,
  });

  revalidateStaffSurfaces(qrToken, requestId);
  return { success: true };
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
    const { data: equipment } = await supabase
      .from("equipment")
      .select("name")
      .eq("id", request.equipment_id)
      .maybeSingle<Pick<Equipment, "name">>();

    const { subject, html, text } = buildResolutionEmail({
      companyName: company.name,
      equipmentName: equipment?.name ?? "your equipment",
      contactName: request.contact_name,
      summary,
      recommendations,
    });

    const sent = await sendEmail({ to: emailTo, subject, html, text });
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
): Promise<ActionResult<{ requestId: string; contactEmail: string | null }>> {
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
    .select("id")
    .single<{ id: string }>();

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
  return { success: true, requestId: inserted.id, contactEmail: contact.contactEmail };
}
