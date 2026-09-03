import { renderEmail, renderEmailText, escapeHtml } from "./layout";

/** Close-out summary sent to the customer when a service request is marked resolved. */
export function buildResolutionEmail({
  companyName,
  equipmentName,
  contactName,
  summary,
  recommendations,
}: {
  companyName: string;
  equipmentName: string;
  contactName: string;
  summary: string;
  recommendations: string;
}): { subject: string; html: string; text: string } {
  const subject = `${equipmentName}: service completed`;
  const greeting = contactName ? `Hi ${escapeHtml(contactName)},` : "Hi there,";

  const bodyHtml = [
    `<p>${greeting}</p>`,
    `<p>Your service request for <strong>${escapeHtml(equipmentName)}</strong> has been completed. Here's a summary of what was done:</p>`,
    `<p style="margin:12px 0;white-space:pre-wrap;">${escapeHtml(summary)}</p>`,
    recommendations
      ? `<p style="margin:16px 0 4px;font-weight:600;">Recommendations</p><p style="margin:0;white-space:pre-wrap;">${escapeHtml(recommendations)}</p>`
      : "",
  ].join("");

  const html = renderEmail({
    heading: "Service completed",
    bodyHtml,
    footerNote: `— ${escapeHtml(companyName)}`,
  });

  const text = renderEmailText({
    heading: `Hi ${contactName || "there"},`,
    lines: [
      `Your service request for ${equipmentName} has been completed. Here's a summary of what was done:`,
      null,
      summary,
      recommendations ? `\nRecommendations:\n${recommendations}` : undefined,
    ],
    footerNote: `— ${companyName}`,
  });

  return { subject, html, text };
}
