import "server-only";
import { escapeHtml, renderEmail, renderEmailText } from "./layout";
import type { RequestEmailBranding } from "./request-status";

/** Customer-facing "your equipment is due for maintenance" email — sent by the pm-due cron. */
export function buildPmDueEmail({
  brand,
  equipmentName,
  scheduleName,
  contactName,
  dueDateText,
  statusUrl,
}: {
  brand: RequestEmailBranding;
  equipmentName: string;
  scheduleName: string;
  contactName: string;
  /** Already formatted, e.g. "Sep 20, 2026". */
  dueDateText: string;
  statusUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `${equipmentName} is due for ${scheduleName} around ${dueDateText}`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";

  const html = renderEmail({
    heading: "Maintenance due soon",
    brand,
    bodyHtml: [
      `<p>${greeting}</p>`,
      `<p><strong>${escapeHtml(equipmentName)}</strong> is due for <strong>${escapeHtml(
        scheduleName
      )}</strong> around <strong>${escapeHtml(dueDateText)}</strong>. ${escapeHtml(
        brand.name
      )} has created a service request to schedule it.</p>`,
      brand.phone
        ? `<p style="margin:16px 0 0;color:#64748b;">Questions? Call ${escapeHtml(brand.phone)}.</p>`
        : "",
    ].join(""),
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${escapeHtml(brand.name)}`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `${equipmentName} is due for ${scheduleName} around ${dueDateText}. ${brand.name} has created a service request to schedule it.`,
      brand.phone ? `Questions? Call ${brand.phone}.` : undefined,
    ],
    cta: { label: "View request", url: statusUrl },
    footerNote: `— ${brand.name}`,
  });

  return { subject, html, text };
}
