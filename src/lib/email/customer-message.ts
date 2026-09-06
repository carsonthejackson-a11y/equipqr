import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";
import { REQUEST_STATUS_LABELS } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/types";

/**
 * Staff-facing notification sent when a customer replies on the public
 * /r/<token> status page. EquipQR-branded like the new-request notification
 * (it goes to the company, not to the customer). The message body is
 * customer-typed text, so it is escaped and rendered as-is — never
 * interpreted as HTML.
 */
export function buildCustomerMessageEmail({
  equipmentName,
  contactName,
  body,
  status,
  dashboardUrl,
}: {
  equipmentName: string;
  contactName: string;
  body: string;
  status: RequestStatus;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Customer replied: ${equipmentName}`;
  const cta: EmailCta = { label: "Open request", url: dashboardUrl };
  const statusLabel = REQUEST_STATUS_LABELS[status] ?? status;

  const bodyHtml = [
    `<p><strong>${escapeHtml(contactName)}</strong> replied on the request for <strong>${escapeHtml(equipmentName)}</strong>.</p>`,
    `<blockquote style="margin:16px 0 0;padding:12px 14px;background:#f8fafc;border-left:3px solid #0d9488;border-radius:0 8px 8px 0;white-space:pre-wrap;">${escapeHtml(body)}</blockquote>`,
    `<p style="margin:16px 0 0;color:#64748b;">Request status: ${escapeHtml(statusLabel)}. Reply from the request page — customer-visible notes show up on their status link.</p>`,
  ].join("");

  const html = renderEmail({ heading: "Customer replied", bodyHtml, cta });

  const text = renderEmailText({
    heading: `${contactName} replied on the request for ${equipmentName}.`,
    lines: [
      body,
      null,
      `Request status: ${statusLabel}`,
      "Reply from the request page — customer-visible notes show up on their status link.",
    ],
    cta,
  });

  return { subject, html, text };
}
