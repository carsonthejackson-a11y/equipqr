import "server-only";
import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";

// Staff notification for a customer message added via the public /r/<token>
// message composer (POST /api/request-updates, migration 0019). Always
// EquipQR-branded like the other staff-facing notifications (new-request,
// invites) — this lands in the company's own inbox, not the customer's.

export function buildCustomerMessageEmail({
  equipmentName,
  authorName,
  body,
  dashboardUrl,
}: {
  equipmentName: string;
  /** Name the customer typed into the composer — free text, never trust it as an identity. */
  authorName: string;
  body: string;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `New message on ${equipmentName} request`;
  const cta: EmailCta = { label: "View in dashboard", url: dashboardUrl };

  const html = renderEmail({
    heading: "New customer message",
    bodyHtml: [
      `<p><strong>${escapeHtml(authorName)}</strong> added a note to the service request for <strong>${escapeHtml(equipmentName)}</strong>:</p>`,
      `<div style="margin:12px 0;padding:12px 14px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;white-space:pre-wrap;">${escapeHtml(body)}</div>`,
    ].join(""),
    cta,
  });

  const text = renderEmailText({
    heading: `${authorName} added a note to the ${equipmentName} request:`,
    lines: [body],
    cta,
  });

  return { subject, html, text };
}
