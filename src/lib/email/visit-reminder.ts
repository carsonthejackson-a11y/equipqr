import "server-only";
import { escapeHtml, renderEmail, renderEmailText } from "./layout";
import type { RequestEmailBranding } from "./request-status";

/** Customer-facing "your visit is coming up" email — sent by the visit-reminders cron. */
export function buildVisitReminderEmail({
  brand,
  equipmentName,
  contactName,
  whenText,
  statusUrl,
}: {
  brand: RequestEmailBranding;
  equipmentName: string;
  contactName: string;
  /** Already formatted in the company's timezone, e.g. "Tuesday, Sep 9 at 2:00 PM". */
  whenText: string;
  statusUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Reminder: visit for ${equipmentName} on ${whenText}`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";

  const html = renderEmail({
    heading: "Upcoming visit reminder",
    brand,
    bodyHtml: [
      `<p>${greeting}</p>`,
      `<p>This is a reminder that ${escapeHtml(brand.name)} has a visit scheduled for <strong>${escapeHtml(
        equipmentName
      )}</strong> on <strong>${escapeHtml(whenText)}</strong>.</p>`,
      brand.phone
        ? `<p style="margin:16px 0 0;color:#64748b;">Need to reschedule? Call ${escapeHtml(brand.phone)}.</p>`
        : "",
    ].join(""),
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${escapeHtml(brand.name)}`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `This is a reminder that ${brand.name} has a visit scheduled for ${equipmentName} on ${whenText}.`,
      brand.phone ? `Need to reschedule? Call ${brand.phone}.` : undefined,
    ],
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${brand.name}`,
  });

  return { subject, html, text };
}
