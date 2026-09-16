import "server-only";
import { escapeHtml, renderEmail, renderEmailText, sanitizeEmailSubject, type EmailCta } from "./layout";
import { mapsHref } from "@/lib/contact-links";

// Tells the ASSIGNED TECHNICIAN about a job (C1-44): before this, assigning
// someone in the dashboard, scheduling/rescheduling their visit, and the
// visit-reminder cron all emailed only the customer — the one person
// actually being sent somewhere never heard about it by email at all,
// except in the one unrelated case where a customer replied on `/r/`.
// Always EquipQR-branded like the other staff-facing templates
// (new-request, customer message) — this lands in a teammate's own inbox,
// not a customer's, so it never carries the company's own branding.

export type AssigneeNotificationReason = "assigned" | "scheduled" | "reminder";

const HEADING: Record<AssigneeNotificationReason, string> = {
  assigned: "You've been assigned a job",
  scheduled: "Visit scheduled",
  reminder: "Upcoming visit reminder",
};

function leadLine(reason: AssigneeNotificationReason, equipmentName: string, siteName: string | null): string {
  const where = siteName ? ` at ${siteName}` : "";
  switch (reason) {
    case "assigned":
      return `You've been assigned to ${equipmentName}${where}.`;
    case "scheduled":
      return `A visit for ${equipmentName}${where} has been scheduled.`;
    case "reminder":
      return `Reminder: you have a visit for ${equipmentName}${where} coming up.`;
  }
}

export type AssigneeNotificationEmailInput = {
  reason: AssigneeNotificationReason;
  technicianName: string | null;
  equipmentName: string;
  /** Customer name (service_provider) or location name (equipment_owner) — the caller resolves the vocab-appropriate label; null when nothing's on file. */
  siteName: string | null;
  address: string | null;
  /**
   * Already formatted in the company's own timezone with a zone label
   * (formatCompanyLongDateTime — e.g. "Wednesday, September 16 at 10:00 AM
   * CDT"). Null when nothing is scheduled yet (only valid for `reason:
   * "assigned"` — the other two reasons always have a time).
   */
  whenText: string | null;
  /** getEquipmentPublicUrl() for the unit's current QR code, or null when the unit has none on file — the CTA falls back to requestUrl. */
  staffScanUrl: string | null;
  requestUrl: string;
};

/** Emails the assigned technician about a job. Never the customer's template, never customer-branded. */
export function buildAssigneeNotificationEmail({
  reason,
  technicianName,
  equipmentName,
  siteName,
  address,
  whenText,
  staffScanUrl,
  requestUrl,
}: AssigneeNotificationEmailInput): { subject: string; html: string; text: string } {
  const heading = HEADING[reason];
  const greeting = technicianName ? `Hi ${escapeHtml(technicianName)},` : "Hi,";
  const lead = leadLine(reason, equipmentName, siteName);

  const subject = sanitizeEmailSubject(
    reason === "assigned"
      ? `Assigned to you: ${equipmentName}`
      : `${reason === "reminder" ? "Reminder: v" : "V"}isit for ${equipmentName}${whenText ? ` — ${whenText}` : ""}`
  );

  const cta: EmailCta = staffScanUrl
    ? { label: "Open the job", url: staffScanUrl }
    : { label: "Open in EquipQR", url: requestUrl };

  const mapsUrl = address ? mapsHref(address) : null;

  const htmlParts: string[] = [`<p>${greeting}</p>`, `<p>${escapeHtml(lead)}</p>`];
  if (whenText) {
    htmlParts.push(`<p style="margin:12px 0 0;"><strong>Scheduled:</strong> ${escapeHtml(whenText)}</p>`);
  }
  if (address && mapsUrl) {
    htmlParts.push(
      `<p style="margin:4px 0 0;"><a href="${escapeHtml(mapsUrl)}" style="color:#0d9488;">${escapeHtml(address)}</a></p>`
    );
  }
  if (staffScanUrl) {
    htmlParts.push(
      `<p style="margin:16px 0 0;color:#64748b;"><a href="${escapeHtml(requestUrl)}" style="color:#64748b;">View the full request in the dashboard</a></p>`
    );
  }

  const html = renderEmail({ heading, bodyHtml: htmlParts.join(""), cta });

  const text = renderEmailText({
    heading: technicianName ? `Hi ${technicianName},` : "Hi,",
    lines: [
      lead,
      whenText ? `Scheduled: ${whenText}` : undefined,
      address ? `Location: ${address}` : undefined,
      mapsUrl ? `Directions: ${mapsUrl}` : undefined,
      staffScanUrl ? `Full request: ${requestUrl}` : undefined,
    ],
    cta,
  });

  return { subject, html, text };
}
