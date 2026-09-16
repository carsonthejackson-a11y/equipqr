import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, renderEmailText, escapeHtml, type EmailBrand } from "./layout";
import { sendCompanyEmail } from "./company-email";
import { resolveBranding } from "@/lib/branding";
import { getRequestStatusUrl } from "@/lib/qr";
import { emitRequestActivity } from "@/lib/events";
import { REQUEST_STATUS_LABELS } from "@/components/status-badge";
import { formatCompanyLongDateTime, DEFAULT_COMPANY_TIME_ZONE } from "@/lib/format";
import { vocabFor, type Vocab } from "@/lib/vocab";
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

/**
 * "Your request is in the queue" / "A technician is working on your
 * request" etc. — vocab-aware (C1-05) so an owner-kind reporter who added an
 * email on `/r/` reads "work order" / "vendor" instead of provider wording.
 * `when` is already formatted in the company zone with a zone label
 * (C1-23/Q-01) — see {@link buildRequestStatusUpdateEmail}.
 */
function statusLineFor(status: RequestStatus, vocab: Vocab, when: string | null): string {
  const request = vocab.requestSingular.toLowerCase();
  const assignee = vocab.assigneeNoun.toLowerCase();
  switch (status) {
    case "new":
      return `Your ${request} is in the queue.`;
    case "in_progress":
      return `A ${assignee} is working on your ${request}.`;
    case "scheduled":
      return when ? `A visit is scheduled for ${when}.` : "A visit has been scheduled.";
    case "on_hold":
      return `Your ${request} is on hold for now.`;
    case "resolved":
      return `Your ${request} has been resolved.`;
    case "canceled":
      return `Your ${request} has been canceled.`;
  }
}

export function buildRequestStatusUpdateEmail({
  brand,
  equipmentName,
  contactName,
  status,
  statusUrl,
  note,
  scheduledFor,
  timeZone,
  vocab = vocabFor(undefined),
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
  /**
   * The company's own IANA zone (`companies.timezone`) — a scheduled visit's
   * time is rendered in THIS zone with a zone abbreviation, never the
   * server process's own timezone (C1-23/Q-01: this email used to render in
   * server UTC with no zone label). Required so a caller can't silently
   * forget it; pass `DEFAULT_COMPANY_TIME_ZONE` if the company row genuinely
   * has none.
   */
  timeZone: string;
  /** service_provider vs equipment_owner nouns (C1-05) — defaults to provider wording for callers that haven't resolved a company kind. */
  vocab?: Vocab;
}): { subject: string; html: string; text: string } {
  const label = REQUEST_STATUS_LABELS[status];
  const subject = `${equipmentName}: ${label.toLowerCase()}`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";
  const when = scheduledFor ? formatCompanyLongDateTime(scheduledFor, timeZone) : null;
  const line = statusLineFor(status, vocab, when);

  const html = renderEmail({
    heading: `Update: ${label}`,
    brand,
    bodyHtml: [
      `<p>${greeting}</p>`,
      `<p>Status update on your ${escapeHtml(vocab.requestSingular.toLowerCase())} for <strong>${escapeHtml(equipmentName)}</strong>: ${escapeHtml(line)}</p>`,
      note ? `<p style="margin:12px 0;white-space:pre-wrap;">${escapeHtml(note)}</p>` : "",
      brand.phone ? `<p style="margin:16px 0 0;color:#64748b;">Questions? Call ${escapeHtml(brand.phone)}.</p>` : "",
    ].join(""),
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${escapeHtml(brand.name)}`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `Status update on your ${vocab.requestSingular.toLowerCase()} for ${equipmentName}: ${line}`,
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
 * the requester left no email, sends through sendCompanyEmail() so the
 * envelope is "{Company} via EquipQR" with Reply-To the company's own inbox
 * (C1-43), records an `email_sent` activity row on success, and never
 * throws. Pass the RLS-scoped server client.
 *
 * Returns whether an email actually went out — `false` covers "opted out",
 * "no email on file" and "Resend declined the send" alike, so a caller can
 * show an honest "Customer notified" only when this is `true` (C1-31/Q-03).
 * Keep this signature in mind before changing it: QoL-2a's staff-scan
 * toasts and QoL-4's dashboard toasts are both meant to read this.
 */
export async function notifyRequesterOfStatus(
  supabase: SupabaseClient,
  params: {
    request: Pick<ServiceRequest, "id" | "company_id" | "contact_name" | "contact_email" | "public_token" | "scheduled_for">;
    status: RequestStatus;
    equipmentName: string;
    company: CompanyPublicProfile & { customer_updates_enabled: boolean; notification_email: string | null };
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
      timeZone: company.timezone ?? DEFAULT_COMPANY_TIME_ZONE,
      vocab: vocabFor(company.kind),
    });

    const { sent } = await sendCompanyEmail({
      company: { name: company.name, notification_email: company.notification_email },
      to: request.contact_email,
      subject,
      html,
      text,
    });
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
