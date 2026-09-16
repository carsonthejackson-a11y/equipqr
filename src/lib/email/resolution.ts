import { renderEmail, renderEmailText, escapeHtml } from "./layout";
import type { RequestEmailBranding } from "./request-status";

/**
 * Close-out summary sent to the customer when a service request is marked
 * resolved. Company-branded like every other customer-facing template
 * (C1-45) — this used to be the one exception, sent with hard-coded teal and
 * no logo even on plans that pay for branding.
 */
export function buildResolutionEmail({
  brand,
  equipmentName,
  contactName,
  summary,
  recommendations,
  requestNoun = "service request",
}: {
  brand: RequestEmailBranding;
  equipmentName: string;
  contactName: string;
  summary: string;
  recommendations: string;
  /** Lowercase noun for the thing that got resolved — "service request" (default) or "work order" for owner kind (vocabFor(kind).requestSingular.toLowerCase()). */
  requestNoun?: string;
}): { subject: string; html: string; text: string } {
  const subject = `${equipmentName}: service completed`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";

  const bodyHtml = [
    `<p>${greeting}</p>`,
    `<p>Your ${escapeHtml(requestNoun)} for <strong>${escapeHtml(equipmentName)}</strong> has been completed. Here's a summary of what was done:</p>`,
    `<p style="margin:12px 0;white-space:pre-wrap;">${escapeHtml(summary)}</p>`,
    recommendations
      ? `<p style="margin:16px 0 4px;font-weight:600;">Recommendations</p><p style="margin:0;white-space:pre-wrap;">${escapeHtml(recommendations)}</p>`
      : "",
    brand.phone ? `<p style="margin:16px 0 0;color:#64748b;">Questions? Call ${escapeHtml(brand.phone)}.</p>` : "",
  ].join("");

  const html = renderEmail({
    heading: "Service completed",
    brand,
    bodyHtml,
    footerNote: `— ${escapeHtml(brand.name)}`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `Your ${requestNoun} for ${equipmentName} has been completed. Here's a summary of what was done:`,
      null,
      summary,
      recommendations ? `\nRecommendations:\n${recommendations}` : undefined,
      brand.phone ? `Questions? Call ${brand.phone}.` : undefined,
    ],
    footerNote: `— ${brand.name}`,
  });

  return { subject, html, text };
}
