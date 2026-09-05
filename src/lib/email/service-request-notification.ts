import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";

type PathEntry = { question: string; answer: string };

/** Notification sent to company staff when a customer submits a new service request via the public QR scan flow. */
export function buildServiceRequestNotificationEmail({
  equipmentName,
  contactName,
  contactEmail,
  contactPhone,
  description,
  mediaCount,
  aiSummary,
  troubleshootingPath,
  dashboardUrl,
  priority,
}: {
  equipmentName: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  description: string;
  mediaCount: number;
  aiSummary: string | null;
  troubleshootingPath: PathEntry[];
  dashboardUrl: string;
  /** Human label for the urgency the requester chose ("Not urgent" → "Low"). Omitted for callers that don't collect one. */
  priority?: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `New service request: ${equipmentName}`;
  const cta: EmailCta = { label: "View in dashboard", url: dashboardUrl };

  const contactLine = [contactName, contactEmail, contactPhone]
    .filter((v): v is string => !!v)
    .map(escapeHtml)
    .join(" · ");

  const htmlParts: string[] = [
    `<p>A new service request was submitted for <strong>${escapeHtml(equipmentName)}</strong>.</p>`,
    `<p style="margin:16px 0 4px;"><strong>Contact:</strong> ${contactLine}</p>`,
    `<p style="margin:16px 0 4px;"><strong>Description</strong></p><p style="margin:0;white-space:pre-wrap;">${escapeHtml(description)}</p>`,
  ];

  if (priority) {
    htmlParts.push(`<p style="margin:12px 0 0;"><strong>Urgency:</strong> ${escapeHtml(priority)}</p>`);
  }

  if (mediaCount > 0) {
    htmlParts.push(
      `<p style="margin:16px 0 0;color:#64748b;">${mediaCount} attachment${mediaCount === 1 ? "" : "s"} included — view them in the dashboard.</p>`
    );
  }

  if (aiSummary) {
    htmlParts.push(
      `<div style="margin:16px 0 0;padding:12px 14px;background:#f0fdfa;border-radius:8px;border:1px solid #99f6e4;">` +
        `<p style="margin:0 0 4px;font-weight:600;">AI summary</p>` +
        `<p style="margin:0;">${escapeHtml(aiSummary)}</p></div>`
    );
  }

  if (troubleshootingPath.length > 0) {
    htmlParts.push(
      `<p style="margin:16px 0 4px;font-weight:600;">Troubleshooting path</p>` +
        `<ol style="margin:0;padding-left:20px;">` +
        troubleshootingPath
          .map((entry) => `<li>${escapeHtml(entry.question)} → ${escapeHtml(entry.answer)}</li>`)
          .join("") +
        `</ol>`
    );
  }

  const html = renderEmail({ heading: "New service request", bodyHtml: htmlParts.join(""), cta });

  const text = renderEmailText({
    heading: `A new service request was submitted for ${equipmentName}.`,
    lines: [
      `Contact: ${contactName}`,
      contactEmail ? `Email: ${contactEmail}` : undefined,
      contactPhone ? `Phone: ${contactPhone}` : undefined,
      priority ? `Urgency: ${priority}` : undefined,
      null,
      `Description: ${description}`,
      mediaCount > 0 ? `Attachments: ${mediaCount}` : undefined,
      aiSummary ? null : undefined,
      aiSummary ? `AI summary: ${aiSummary}` : undefined,
      troubleshootingPath.length > 0 ? null : undefined,
      troubleshootingPath.length > 0 ? "Troubleshooting path:" : undefined,
      ...troubleshootingPath.map((entry, i) => `${i + 1}. ${entry.question} → ${entry.answer}`),
    ],
    cta,
  });

  return { subject, html, text };
}
