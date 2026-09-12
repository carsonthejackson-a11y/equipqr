import { escapeHtml, renderEmail, renderEmailText, sanitizeEmailSubject, type EmailCta } from "./layout";

// The dispatch email — the one email in this build a company doesn't already
// have a relationship with the recipient for (a vendor's inbox, not a
// customer's or the owner's). Reply-To is set by the caller from
// companies.notification_email (see docs/OWNER-ROADMAP-BRIEF.md §7.8); this
// module only builds the subject/body.

export type VendorDispatchEmailInput = {
  ownerName: string;
  equipmentName: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  inWarranty: boolean;
  locationName: string | null;
  locationAddress: string | null;
  locationHours: string | null;
  symptoms: string[];
  description: string;
  reporterName: string;
  reporterPhone: string | null;
  accountNumber: string | null;
  photoCount: number;
  /** getVendorDispatchUrl(dispatchToken) — built by the caller so this module doesn't need server env access. */
  workOrderUrl: string;
};

/** Vendor-facing "you've got a work order" email. Sent to vendors.email, Reply-To the owner's notification address. */
export function buildVendorDispatchEmail({
  ownerName,
  equipmentName,
  make,
  model,
  serialNumber,
  inWarranty,
  locationName,
  locationAddress,
  locationHours,
  symptoms,
  description,
  reporterName,
  reporterPhone,
  accountNumber,
  photoCount,
  workOrderUrl,
}: VendorDispatchEmailInput): { subject: string; html: string; text: string } {
  // Subjects are capped at 160 here (vs the 140 default) because they already
  // carry two proper nouns (owner + equipment name) before the snippet —
  // sanitizeEmailSubject() still strips CR/LF/tabs regardless of the cap.
  const snippet = symptoms[0] || description.slice(0, 60);
  const subject = sanitizeEmailSubject(`Work order from ${ownerName}: ${equipmentName} — ${snippet}`, 160);
  const cta: EmailCta = { label: "Open the work order", url: workOrderUrl };
  const footerNote =
    "You don't need an account — the link opens a page where you can acknowledge, give an ETA, add a note or attach an invoice.";

  const makeModel = [make, model].filter(Boolean).join(" ");
  const reportedBy = reporterPhone ? `${reporterName} (${reporterPhone})` : reporterName;
  const locationLine = [locationName, locationAddress].filter(Boolean).join(" — ");

  const htmlParts: string[] = [
    `<p><strong>${escapeHtml(ownerName)}</strong> has you on file as the service vendor for this equipment.</p>`,
    `<p style="margin:16px 0 4px;"><strong>${escapeHtml(equipmentName)}</strong>${makeModel ? ` — ${escapeHtml(makeModel)}` : ""}</p>`,
  ];
  if (serialNumber) {
    htmlParts.push(`<p style="margin:0;color:#64748b;">Serial: ${escapeHtml(serialNumber)}</p>`);
  }
  if (inWarranty) {
    htmlParts.push(`<p style="margin:4px 0 0;color:#0d9488;font-weight:600;">In warranty</p>`);
  }
  if (locationLine) {
    htmlParts.push(`<p style="margin:12px 0 0;">${escapeHtml(locationLine)}</p>`);
  }
  if (locationHours) {
    htmlParts.push(`<p style="margin:0;color:#64748b;">Hours: ${escapeHtml(locationHours)}</p>`);
  }
  if (symptoms.length > 0) {
    htmlParts.push(
      `<p style="margin:16px 0 4px;"><strong>Reported symptoms</strong></p>` +
        `<ul style="margin:0;padding-left:20px;">${symptoms.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    );
  }
  if (description.trim()) {
    htmlParts.push(
      `<p style="margin:16px 0 4px;"><strong>Description</strong></p>` +
        `<p style="margin:0;white-space:pre-wrap;">${escapeHtml(description)}</p>`
    );
  }
  htmlParts.push(`<p style="margin:16px 0 0;color:#64748b;">Reported by ${escapeHtml(reportedBy)}</p>`);
  if (accountNumber) {
    htmlParts.push(`<p style="margin:4px 0 0;color:#64748b;">Account #: ${escapeHtml(accountNumber)}</p>`);
  }
  if (photoCount > 0) {
    htmlParts.push(
      `<p style="margin:4px 0 0;color:#64748b;">${photoCount} photo${photoCount === 1 ? "" : "s"} attached — view ${photoCount === 1 ? "it" : "them"} on the work order page.</p>`
    );
  }

  const html = renderEmail({
    heading: `Work order: ${equipmentName}`,
    bodyHtml: htmlParts.join(""),
    cta,
    footerNote,
  });

  const text = renderEmailText({
    heading: `Work order from ${ownerName}: ${equipmentName}`,
    lines: [
      makeModel ? `Equipment: ${equipmentName} — ${makeModel}` : `Equipment: ${equipmentName}`,
      serialNumber ? `Serial: ${serialNumber}` : undefined,
      inWarranty ? "In warranty" : undefined,
      locationLine ? `Location: ${locationLine}` : undefined,
      locationHours ? `Hours: ${locationHours}` : undefined,
      null,
      symptoms.length > 0 ? `Symptoms: ${symptoms.join(", ")}` : undefined,
      description.trim() ? `Description: ${description}` : undefined,
      null,
      `Reported by ${reportedBy}`,
      accountNumber ? `Account #: ${accountNumber}` : undefined,
      photoCount > 0 ? `${photoCount} photo(s) attached` : undefined,
    ],
    cta,
    footerNote,
  });

  return { subject, html, text };
}
