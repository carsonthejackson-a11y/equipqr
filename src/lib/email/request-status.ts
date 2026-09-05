import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, renderEmailText, escapeHtml, type EmailBrand } from "./layout";
import { sendEmail } from "./send";
import { resolveBranding } from "@/lib/branding";
import { getRequestStatusUrl } from "@/lib/qr";
import { emitRequestActivity } from "@/lib/events";
import { REQUEST_STATUS_LABELS } from "@/components/status-badge";
import type { CompanyPublicProfile, RequestStatus, ServiceRequest } from "@/lib/types";
import type { PlanId } from "@/lib/plans";

// Customer-facing emails about a service request, branded with the company's
// logo/colour when their plan allows. Two templates:
//   - "received": sent right after submit (from /api/service-requests)
//   - "status update": sent when staff change status / schedule a visit
// Both link to the public /r/<token> status page.
//
// The close-out email (src/lib/email/resolution.ts) stays separate — it
// carries the technician's written summary and is sent explicitly from the
// close dialog.

export type RequestEmailBranding = EmailBrand & { phone: string | null };

export function brandingForEmail(params: {
  company: CompanyPublicProfile;
  planId: PlanId | null | undefined;
  supabaseUrl: string;
}): RequestEmailBranding {
  const b = resolveBranding(params);
  return { name: b.companyName, color: b.brandColor, onColor: b.onBrandColor, logoUrl: b.logoUrl, phone: b.phone };
}

export function buildRequestReceivedEmail({
  brand,
  equipmentName,
  contactName,
  statusUrl,
}: {
  brand: RequestEmailBranding;
  equipmentName: string;
  contactName: string;
  statusUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `We received your request for ${equipmentName}`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";

  const html = renderEmail({
    heading: "Request received",
    brand,
    bodyHtml: [
      `<p>${greeting}</p>`,
      `<p>${escapeHtml(brand.name)} has your service request for <strong>${escapeHtml(equipmentName)}</strong> and will be in touch.</p>`,
      `<p>You can check on it any time using the link below — we'll email you here when its status changes.</p>`,
      brand.phone
        ? `<p style="margin:16px 0 0;color:#64748b;">Need it sooner? Call ${escapeHtml(brand.phone)}.</p>`
        : "",
    ].join(""),
    cta: { label: "Check request status", url: statusUrl },
    footerNote: `You're receiving this because you submitted a service request to ${escapeHtml(brand.name)}.`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `${brand.name} has your service request for ${equipmentName} and will be in touch.`,
      `You can check on it any time at the link below — we'll email you when its status changes.`,
      brand.phone ? `Need it sooner? Call ${brand.phone}.` : undefined,
    ],
    cta: { label: "Check request status", url: statusUrl },
  });

  return { subject, html, text };
}

export function buildRequestStatusUpdateEmail({
  brand,
  equipmentName,
  contactName,
  status,
  statusUrl,
  note,
  scheduledFor,
}: {
  brand: RequestEmailBranding;
  equipmentName: string;
  contactName: string;
  status: RequestStatus;
  statusUrl: string;
  /** Optional customer-visible message from staff. */
  note?: string | null;
  /** ISO timestamp of a scheduled visit, if any. */
  scheduledFor?: string | null;
}): { subject: string; html: string; text: string } {
  const label = REQUEST_STATUS_LABELS[status];
  const subject = `${equipmentName}: ${label.toLowerCase()}`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";
  const when = scheduledFor ? new Date(scheduledFor).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }) : null;

  const statusLine: Record<RequestStatus, string> = {
    new: "Your request is in the queue.",
    in_progress: "A technician is working on your request.",
    scheduled: when ? `A visit is scheduled for ${when}.` : "A visit has been scheduled.",
    on_hold: "Your request is on hold for now.",
    resolved: "Your request has been resolved.",
    canceled: "Your request has been canceled.",
  };

  const html = renderEmail({
    heading: `Update: ${label}`,
    brand,
    bodyHtml: [
      `<p>${greeting}</p>`,
      `<p>Status update on your service request for <strong>${escapeHtml(equipmentName)}</strong>: ${escapeHtml(statusLine[status])}</p>`,
      note ? `<p style="margin:12px 0;white-space:pre-wrap;">${escapeHtml(note)}</p>` : "",
      brand.phone ? `<p style="margin:16px 0 0;color:#64748b;">Questions? Call ${escapeHtml(brand.phone)}.</p>` : "",
    ].join(""),
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${escapeHtml(brand.name)}`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `Status update on your service request for ${equipmentName}: ${statusLine[status]}`,
      note ? `\n${note}` : undefined,
      brand.phone ? `Questions? Call ${brand.phone}.` : undefined,
    ],
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${brand.name}`,
  });

  return { subject, html, text };
}

/**
 * One-call "tell the requester their request changed" used by dashboard
 * actions. Respects companies.customer_updates_enabled, skips silently when
 * the requester left no email, records an `email_sent` activity row on
 * success, and never throws. Pass the RLS-scoped server client.
 */
export async function notifyRequesterOfStatus(
  supabase: SupabaseClient,
  params: {
    request: Pick<ServiceRequest, "id" | "company_id" | "contact_name" | "contact_email" | "public_token" | "scheduled_for">;
    status: RequestStatus;
    equipmentName: string;
    company: CompanyPublicProfile & { customer_updates_enabled: boolean };
    planId: PlanId | null | undefined;
    supabaseUrl: string;
    note?: string | null;
    actorUserId?: string | null;
  }
): Promise<boolean> {
  const { request, company } = params;
  if (!company.customer_updates_enabled || !request.contact_email) return false;

  try {
    const brand = brandingForEmail({ company, planId: params.planId, supabaseUrl: params.supabaseUrl });
    const { subject, html, text } = buildRequestStatusUpdateEmail({
      brand,
      equipmentName: params.equipmentName,
      contactName: request.contact_name,
      status: params.status,
      statusUrl: getRequestStatusUrl(request.public_token),
      note: params.note,
      scheduledFor: request.scheduled_for,
    });

    const sent = await sendEmail({ to: request.contact_email, subject, html, text });
    if (sent) {
      await emitRequestActivity(supabase, {
        companyId: request.company_id,
        serviceRequestId: request.id,
        kind: "email_sent",
        visibility: "internal",
        body: `Status email sent to ${request.contact_email}`,
        metadata: { status: params.status, to: request.contact_email },
        authorKind: "system",
        authorUserId: params.actorUserId ?? null,
      });
    }
    return sent;
  } catch (err) {
    console.error("notifyRequesterOfStatus failed:", err);
    return false;
  }
}
