// Pure helpers for staff scan mode (`/e/[qrToken]/staff/**`) — storage path
// builders, the "on my way" note text, and small validation used by both the
// client-side close-out form (uploads happen from the browser) and the
// `closeOutFromScan` / `sendOnMyWay` server actions. Nothing here touches the
// network or a Supabase client, so it's covered by plain Vitest tests instead
// of needing a live DB.

import type { Customer, Equipment } from "@/lib/types";

// ----------------------------------------------------------------------------
// Storage paths
// ----------------------------------------------------------------------------
//
// Migration 0019: staff uploads for a request live under
// `staff/<company_id>/<request_id>/…` in the `service-request-media` bucket —
// photos get a random name, the signature always overwrites the same name so
// re-signing a request replaces it instead of accumulating orphans.

export function buildStaffPhotoPath(companyId: string, requestId: string, id: string): string {
  return `staff/${companyId}/${requestId}/${id}.jpg`;
}

export function buildStaffSignaturePath(companyId: string, requestId: string): string {
  return `staff/${companyId}/${requestId}/signature.png`;
}

// ----------------------------------------------------------------------------
// "On my way"
// ----------------------------------------------------------------------------

export const MIN_ETA_MINUTES = 1;
export const MAX_ETA_MINUTES = 240;

/** Clamps whatever a technician typed into a sane ETA. Non-finite input (empty box, NaN) returns null — no ETA is still a valid "on my way". */
export function clampEtaMinutes(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(MIN_ETA_MINUTES, Math.min(MAX_ETA_MINUTES, Math.round(value)));
}

/** The customer-visible note stamped when a technician taps "On my way". */
export function formatOnMyWayNote(technicianName: string, etaMinutes: number | null): string {
  const firstName = technicianName.trim().split(/\s+/)[0] || "Your technician";
  return etaMinutes ? `${firstName} is on the way — ETA ~${etaMinutes} min` : `${firstName} is on the way`;
}

// ----------------------------------------------------------------------------
// Close-out validation
// ----------------------------------------------------------------------------

export type CloseOutInput = {
  summary: string;
  sendEmail: boolean;
  emailTo: string;
};

/** Same rule `closeServiceRequest` enforces on the dashboard: a summary is required, and an email toggle needs somewhere to send it. */
export function validateCloseOut(input: CloseOutInput): string | null {
  if (!input.summary.trim()) return "Summary of work performed is required";
  if (input.sendEmail && !input.emailTo.trim()) {
    return "Enter an email address, or turn off emailing the customer";
  }
  return null;
}

// ----------------------------------------------------------------------------
// "Log a visit" contact resolution
// ----------------------------------------------------------------------------

export type VisitContact = {
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

/**
 * Fills in a brand-new "log a visit" request's contact fields from whatever
 * the unit already knows: the equipment's own contact first (it's the most
 * specific — a machine can have a different on-site contact than the
 * customer's billing contact), falling back to the linked customer, and
 * finally the customer's own name so the request never has a blank contact.
 */
export function resolveVisitContact(
  equipment: Pick<Equipment, "contact_name" | "contact_phone">,
  customer: Pick<Customer, "name" | "contact_name" | "contact_email" | "contact_phone"> | null
): VisitContact {
  const contactName =
    equipment.contact_name?.trim() || customer?.contact_name?.trim() || customer?.name?.trim() || "Unknown contact";
  const contactPhone = equipment.contact_phone?.trim() || customer?.contact_phone?.trim() || null;
  const contactEmail = customer?.contact_email?.trim() || null;
  return { contactName, contactEmail, contactPhone: contactPhone || null };
}
