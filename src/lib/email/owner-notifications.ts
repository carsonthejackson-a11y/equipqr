import { escapeHtml, renderEmail, renderEmailText, sanitizeEmailSubject, type EmailCta } from "./layout";
import { formatZonedDateTime } from "@/lib/schedule";
import { VENDOR_ACTION_PAST_TENSE, type VendorAction } from "@/lib/dispatch";

// Owner-facing notification emails (docs/OWNER-ROADMAP-BRIEF.md §3.3.9).
// All three are EquipQR-branded (no `brand` argument to renderEmail) — the
// same rule buildServiceRequestNotificationEmail already follows for
// staff-facing mail — and none of them sets a Reply-To.

function symptomsAndDescriptionHtml(symptoms: string[], description: string): string[] {
  const parts: string[] = [];
  if (symptoms.length > 0) {
    parts.push(
      `<p style="margin:16px 0 4px;"><strong>Symptoms</strong></p>` +
        `<ul style="margin:0;padding-left:20px;">${symptoms.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    );
  }
  if (description.trim()) {
    parts.push(
      `<p style="margin:16px 0 4px;"><strong>Description</strong></p>` +
        `<p style="margin:0;white-space:pre-wrap;">${escapeHtml(description)}</p>`
    );
  }
  return parts;
}

export type OwnerNewRequestEmailInput = {
  equipmentName: string;
  locationName: string | null;
  reporterName: string;
  reporterPhone: string | null;
  priorityLabel: string;
  symptoms: string[];
  description: string;
  vendorName: string;
  vendorPhone: string | null;
  requestUrl: string;
};

/** "New work order, sent to a vendor" — the common case. To companies.notification_email. */
export function buildOwnerNewRequestEmail({
  equipmentName,
  locationName,
  reporterName,
  reporterPhone,
  priorityLabel,
  symptoms,
  description,
  vendorName,
  vendorPhone,
  requestUrl,
}: OwnerNewRequestEmailInput): { subject: string; html: string; text: string } {
  const subject = sanitizeEmailSubject(
    `New work order: ${equipmentName}${locationName ? ` at ${locationName}` : ""} — sent to ${vendorName}`
  );
  const cta: EmailCta = { label: "Open in EquipQR", url: requestUrl };
  const reportedBy = reporterPhone ? `${reporterName} (${reporterPhone})` : reporterName;

  const html = renderEmail({
    heading: `New work order: ${equipmentName}`,
    bodyHtml: [
      `<p>Reported by <strong>${escapeHtml(reportedBy)}</strong> · Urgency: <strong>${escapeHtml(priorityLabel)}</strong></p>`,
      ...symptomsAndDescriptionHtml(symptoms, description),
      `<p style="margin:16px 0 0;">Sent to <strong>${escapeHtml(vendorName)}</strong>${
        vendorPhone ? ` (${escapeHtml(vendorPhone)})` : ""
      } by email.</p>`,
    ].join(""),
    cta,
  });

  const text = renderEmailText({
    heading: `New work order: ${equipmentName}`,
    lines: [
      `Reported by: ${reportedBy}`,
      `Urgency: ${priorityLabel}`,
      null,
      symptoms.length > 0 ? `Symptoms: ${symptoms.join(", ")}` : undefined,
      description.trim() ? `Description: ${description}` : undefined,
      null,
      `Sent to ${vendorName}${vendorPhone ? ` (${vendorPhone})` : ""} by email.`,
    ],
    cta,
  });

  return { subject, html, text };
}

export type OwnerNoVendorEmailInput = {
  equipmentName: string;
  locationName: string | null;
  reporterName: string;
  reporterPhone: string | null;
  priorityLabel: string;
  symptoms: string[];
  description: string;
  equipmentUrl: string;
};

/** Same shape as {@link buildOwnerNewRequestEmail}, for a unit with no vendor to dispatch to. */
export function buildOwnerNoVendorEmail({
  equipmentName,
  locationName,
  reporterName,
  reporterPhone,
  priorityLabel,
  symptoms,
  description,
  equipmentUrl,
}: OwnerNoVendorEmailInput): { subject: string; html: string; text: string } {
  const subject = sanitizeEmailSubject(
    `New work order: ${equipmentName}${locationName ? ` at ${locationName}` : ""} — no vendor on file`
  );
  const cta: EmailCta = { label: "Set up a vendor", url: equipmentUrl };
  const reportedBy = reporterPhone ? `${reporterName} (${reporterPhone})` : reporterName;
  const noVendorNote =
    "No vendor is assigned to this unit or its category, so nothing was dispatched.";

  const html = renderEmail({
    heading: `New work order: ${equipmentName}`,
    bodyHtml: [
      `<p>Reported by <strong>${escapeHtml(reportedBy)}</strong> · Urgency: <strong>${escapeHtml(priorityLabel)}</strong></p>`,
      ...symptomsAndDescriptionHtml(symptoms, description),
      `<p style="margin:16px 0 0;color:#b45309;font-weight:600;">${noVendorNote}</p>`,
    ].join(""),
    cta,
  });

  const text = renderEmailText({
    heading: `New work order: ${equipmentName}`,
    lines: [
      `Reported by: ${reportedBy}`,
      `Urgency: ${priorityLabel}`,
      null,
      symptoms.length > 0 ? `Symptoms: ${symptoms.join(", ")}` : undefined,
      description.trim() ? `Description: ${description}` : undefined,
      null,
      noVendorNote,
    ],
    cta,
  });

  return { subject, html, text };
}

export type OwnerDispatchUpdateEmailInput = {
  vendorName: string;
  action: VendorAction;
  equipmentName: string;
  locationName: string | null;
  note?: string | null;
  etaAt?: string | null;
  /** companies.timezone — always set (never null) on a Company row. */
  timeZone: string;
  declineReason?: string | null;
  requestUrl: string;
};

/** "A vendor did something" — sent after every vendor action, including an invoice attach. */
export function buildOwnerDispatchUpdateEmail({
  vendorName,
  action,
  equipmentName,
  locationName,
  note,
  etaAt,
  timeZone,
  declineReason,
  requestUrl,
}: OwnerDispatchUpdateEmailInput): { subject: string; html: string; text: string } {
  const pastTense = VENDOR_ACTION_PAST_TENSE[action];
  const subject = sanitizeEmailSubject(`${vendorName} ${pastTense}: ${equipmentName}`);
  const cta: EmailCta = { label: "Open in EquipQR", url: requestUrl };
  const etaText = etaAt ? formatZonedDateTime(etaAt, timeZone) : null;

  const htmlParts: string[] = [
    `<p><strong>${escapeHtml(vendorName)}</strong> ${escapeHtml(pastTense)} for <strong>${escapeHtml(equipmentName)}</strong>${
      locationName ? ` at ${escapeHtml(locationName)}` : ""
    }.</p>`,
  ];
  if (etaText) {
    htmlParts.push(`<p style="margin:12px 0 0;"><strong>ETA:</strong> ${escapeHtml(etaText)}</p>`);
  }
  if (declineReason) {
    htmlParts.push(`<p style="margin:12px 0 0;"><strong>Reason:</strong> ${escapeHtml(declineReason)}</p>`);
  }
  if (note) {
    htmlParts.push(
      `<p style="margin:12px 0 0;"><strong>Note</strong></p><p style="margin:0;white-space:pre-wrap;">${escapeHtml(note)}</p>`
    );
  }

  const html = renderEmail({ heading: `${vendorName} ${pastTense}`, bodyHtml: htmlParts.join(""), cta });

  const text = renderEmailText({
    heading: `${vendorName} ${pastTense}: ${equipmentName}`,
    lines: [
      locationName ? `Location: ${locationName}` : undefined,
      etaText ? `ETA: ${etaText}` : undefined,
      declineReason ? `Reason: ${declineReason}` : undefined,
      note ? null : undefined,
      note ? `Note: ${note}` : undefined,
    ],
    cta,
  });

  return { subject, html, text };
}
