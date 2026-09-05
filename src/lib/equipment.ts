// Pure helpers for the equipment record: what changed on a save (so the
// timeline can say so in words), how a warranty date reads to a human, and
// the lenient parsers the CSV importer needs. No I/O, no React — everything
// here is unit-tested in equipment.test.ts.

import { EQUIPMENT_STATUS_LABELS } from "@/components/status-badge";
import type { Equipment, EquipmentStatus } from "@/lib/types";

// ----------------------------------------------------------------------------
// Change tracking
// ----------------------------------------------------------------------------

/**
 * The equipment columns the edit form and importer write, mapped to the words
 * used in a timeline summary ("Updated make, model and status").
 */
export const EQUIPMENT_FIELD_LABELS = {
  name: "name",
  equipment_type_id: "equipment type",
  customer_id: "customer",
  make: "make",
  model: "model",
  serial_number: "serial number",
  location: "location",
  address: "address",
  contact_name: "site contact",
  contact_phone: "site contact phone",
  install_date: "install date",
  warranty_ends_on: "warranty end date",
  status: "status",
  notes: "notes",
} as const;

export type EquipmentField = keyof typeof EQUIPMENT_FIELD_LABELS;

/** The writable slice of an equipment row — what updateEquipment() diffs and saves. */
export type EquipmentPatch = Pick<Equipment, EquipmentField>;

/** null/undefined and "" are the same thing to a user, and whitespace never counts as a change. */
function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Field names whose value differs between `before` and `after`, in EQUIPMENT_FIELD_LABELS order. */
export function diffEquipment(
  before: Partial<EquipmentPatch>,
  after: Partial<EquipmentPatch>
): EquipmentField[] {
  return (Object.keys(EQUIPMENT_FIELD_LABELS) as EquipmentField[]).filter(
    (field) => normalizeFieldValue(before[field]) !== normalizeFieldValue(after[field])
  );
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Summary for an `equipment_updated` event: "Updated make, model and status". */
export function equipmentUpdateSummary(changed: EquipmentField[]): string {
  if (changed.length === 0) return "Details updated";
  return `Updated ${joinWords(changed.map((field) => EQUIPMENT_FIELD_LABELS[field]))}`;
}

/** Summary for a `status_changed` event: "Status: Active → Needs service". */
export function statusChangeSummary(from: EquipmentStatus, to: EquipmentStatus): string {
  return `Status: ${EQUIPMENT_STATUS_LABELS[from]} → ${EQUIPMENT_STATUS_LABELS[to]}`;
}

// ----------------------------------------------------------------------------
// Dates and warranty
// ----------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function utcDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

/** A "YYYY-MM-DD" string as UTC midnight, or null when it isn't a real calendar date. */
export function parseDateOnly(value: string): number | null {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const stamp = utcDay(y, m, d);
  const back = new Date(stamp);
  // Rejects 2025-02-30 and friends, which Date.UTC would silently roll over.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() + 1 !== m || back.getUTCDate() !== d) {
    return null;
  }
  return stamp;
}

/**
 * Lenient date input for the CSV importer. Accepts "YYYY-MM-DD" and
 * "M/D/YYYY", returns the canonical "YYYY-MM-DD". An empty cell is valid and
 * yields null; anything unparseable is a validation error for the caller.
 */
export function normalizeDateInput(
  value: string
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };

  if (DATE_ONLY.test(trimmed)) {
    return parseDateOnly(trimmed) === null ? { ok: false } : { ok: true, value: trimmed };
  }

  const us = US_DATE.exec(trimmed);
  if (us) {
    const [, m, d, y] = us.map(Number) as [number, number, number, number];
    const canonical = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return parseDateOnly(canonical) === null ? { ok: false } : { ok: true, value: canonical };
  }

  return { ok: false };
}

/** Whole days from `now` (UTC day) to a "YYYY-MM-DD" date. Negative when past. */
export function daysUntilDate(dateOnly: string | null | undefined, now: Date = new Date()): number | null {
  if (!dateOnly) return null;
  const target = parseDateOnly(dateOnly.slice(0, 10));
  if (target === null) return null;
  const today = utcDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** Days inside which a warranty counts as "expiring soon" on the list and detail pages. */
export const WARRANTY_SOON_DAYS = 30;

/** Longest an inline timeline note / service summary may be. Matches the textarea maxLength. */
export const MAX_NOTE_LENGTH = 1000;

export type WarrantyState =
  | { state: "none" }
  | { state: "expired"; days: number }
  | { state: "soon"; days: number }
  | { state: "active"; days: number };

export function warrantyState(
  warrantyEndsOn: string | null | undefined,
  now: Date = new Date()
): WarrantyState {
  const days = daysUntilDate(warrantyEndsOn, now);
  if (days === null) return { state: "none" };
  if (days < 0) return { state: "expired", days: -days };
  if (days <= WARRANTY_SOON_DAYS) return { state: "soon", days };
  return { state: "active", days };
}

/** "Warranty: expires in 12 days" / "Warranty: expired 3 days ago". Null when no date is set. */
export function formatWarranty(
  warrantyEndsOn: string | null | undefined,
  now: Date = new Date()
): string | null {
  const status = warrantyState(warrantyEndsOn, now);
  switch (status.state) {
    case "none":
      return null;
    case "expired":
      return status.days === 0
        ? "Warranty: expired today"
        : `Warranty: expired ${status.days} ${status.days === 1 ? "day" : "days"} ago`;
    default:
      return status.days === 0
        ? "Warranty: expires today"
        : `Warranty: expires in ${status.days} ${status.days === 1 ? "day" : "days"}`;
  }
}

// ----------------------------------------------------------------------------
// Documents
// ----------------------------------------------------------------------------

/** Hard ceiling per document. Manuals and invoices are well under this; a video isn't a document. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/**
 * What the private `equipment-files` bucket accepts: manuals and spec sheets
 * (PDF), photos of a nameplate or a paper invoice, and the office formats a
 * supplier is likely to email over. Checked in the browser for a fast, clear
 * message AND in the server action, which is the check that actually counts.
 */
export const ALLOWED_DOCUMENT_TYPES: { mime: string; label: string }[] = [
  { mime: "application/pdf", label: "PDF" },
  { mime: "image/jpeg", label: "JPEG" },
  { mime: "image/png", label: "PNG" },
  { mime: "image/webp", label: "WebP" },
  { mime: "image/heic", label: "HEIC" },
  { mime: "text/plain", label: "TXT" },
  { mime: "text/csv", label: "CSV" },
  { mime: "application/msword", label: "DOC" },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "DOCX",
  },
  { mime: "application/vnd.ms-excel", label: "XLS" },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  },
];

export const ALLOWED_DOCUMENT_MIME_TYPES = ALLOWED_DOCUMENT_TYPES.map((type) => type.mime);

export function isAllowedDocumentType(mimeType: string | null | undefined): boolean {
  // An empty type is what a browser reports for an extension it doesn't know;
  // the size cap and the bucket's company-scoped RLS still apply to it.
  if (!mimeType) return true;
  return ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType);
}

// ----------------------------------------------------------------------------
// Status parsing (CSV import)
// ----------------------------------------------------------------------------

export const EQUIPMENT_STATUS_VALUES = Object.keys(EQUIPMENT_STATUS_LABELS) as EquipmentStatus[];

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return (EQUIPMENT_STATUS_VALUES as string[]).includes(value);
}

/**
 * Accepts the stored value ("needs_service"), the label ("Needs service") and
 * anything in between (case, spaces vs underscores). Blank means "active".
 * Returns null for anything else so the importer can flag the row.
 */
export function parseEquipmentStatus(value: string): EquipmentStatus | null {
  const trimmed = value.trim();
  if (!trimmed) return "active";
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  return isEquipmentStatus(key) ? key : null;
}
