import { escapeHtml, renderEmail, renderEmailText, sanitizeEmailSubject, type EmailCta } from "./layout";

// The hourly dispatch-sla cron's alert email (docs/OWNER-ROADMAP-BRIEF.md
// §3.3.8/§3.3.9). This is a liability-copy-bearing email, not just a status
// nudge: EquipQR cannot confirm a vendor read the dispatch email, so the body
// has to say so and give the owner the one thing that actually works —
// calling the vendor — as early as possible. The vendor's phone number
// leading the body is deliberate, tested in owner-notifications.test.ts.

function formatOverdue(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourText = `${hours} hour${hours === 1 ? "" : "s"}`;
  return remainder === 0 ? hourText : `${hourText} ${remainder}m`;
}

export type DispatchSlaAlertEmailInput = {
  vendorName: string;
  vendorPhone: string | null;
  equipmentName: string;
  locationName: string | null;
  minutesOverdue: number;
  priorityLabel: string;
  requestUrl: string;
};

export function buildDispatchSlaAlertEmail({
  vendorName,
  vendorPhone,
  equipmentName,
  locationName,
  minutesOverdue,
  priorityLabel,
  requestUrl,
}: DispatchSlaAlertEmailInput): { subject: string; html: string; text: string } {
  const subject = sanitizeEmailSubject(
    `No response yet from ${vendorName}${locationName ? ` — ${equipmentName} at ${locationName}` : ` — ${equipmentName}`}`
  );
  const cta: EmailCta = { label: "Open in EquipQR", url: requestUrl };
  const overdueText = formatOverdue(minutesOverdue);
  const reliableCheckLine =
    "EquipQR can't confirm a vendor received an email — calling is the reliable check.";

  // The vendor's phone leads the body, ahead of every other line.
  const leadLine = vendorPhone
    ? `Call ${vendorName}: ${vendorPhone}`
    : `${vendorName} has no phone number on file`;

  const html = renderEmail({
    heading: `No response yet from ${vendorName}`,
    bodyHtml: [
      `<p style="margin:0 0 16px;font-size:17px;font-weight:700;">${escapeHtml(leadLine)}</p>`,
      `<p>No response in ${escapeHtml(overdueText)} for <strong>${escapeHtml(equipmentName)}</strong>${
        locationName ? ` at ${escapeHtml(locationName)}` : ""
      } · Urgency: <strong>${escapeHtml(priorityLabel)}</strong></p>`,
      `<p style="margin:16px 0 0;color:#64748b;">${escapeHtml(reliableCheckLine)}</p>`,
    ].join(""),
    cta,
  });

  const text = renderEmailText({
    heading: `No response yet from ${vendorName}`,
    lines: [
      leadLine,
      null,
      `No response in ${overdueText} for ${equipmentName}${locationName ? ` at ${locationName}` : ""}`,
      `Urgency: ${priorityLabel}`,
      null,
      reliableCheckLine,
    ],
    cta,
  });

  return { subject, html, text };
}
