// Pure helpers for owner-defined equipment fields (Settings → Custom fields):
// how a label becomes a stable jsonb key, how a submitted form is read into
// typed values, how a value reads back to a human, and what changed between
// two saves. No I/O — the server actions and pages do the querying; this
// file is unit-tested in custom-fields.test.ts.

import { parseDateOnly } from "@/lib/equipment";
import type { CustomFieldType, EquipmentCustomField } from "@/lib/types";

/** Definitions per company. Twenty is plenty for a form that still scrolls on a phone. */
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_FIELD_LABEL_LENGTH = 60;
export const MAX_FIELD_HELP_TEXT_LENGTH = 200;
/** Longest a single text value (or select option) may be. */
export const MAX_FIELD_TEXT_LENGTH = 500;
export const MAX_FIELD_OPTIONS = 50;

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "boolean"] as const;

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  boolean: "Yes / no",
};

export function isCustomFieldType(value: string): value is CustomFieldType {
  return (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

/** The definition columns the settings form writes. */
export type CustomFieldDefinition = Pick<
  EquipmentCustomField,
  "key" | "label" | "field_type" | "options" | "help_text" | "show_on_scan_page"
>;

// ----------------------------------------------------------------------------
// Keys
// ----------------------------------------------------------------------------

/** Mirrors the check constraint on equipment_custom_fields.key (0022). */
const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export function isValidFieldKey(value: string): boolean {
  return FIELD_KEY.test(value);
}

/**
 * "Filter size (in)" → "filter_size_in". Lowercase, runs of anything that
 * isn't a letter or digit collapse to one underscore, trimmed to 40 chars.
 * A label that starts with a digit gets an "f_" prefix so the key still
 * matches the DB's slug rule; a label with nothing usable yields "".
 */
export function slugifyFieldKey(label: string): string {
  let key = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) return "";
  if (!/^[a-z]/.test(key)) key = `f_${key}`;
  return key.slice(0, 40).replace(/_+$/g, "");
}

/** The form input name that carries a field's value. */
export function customFieldInputName(key: string): string {
  return `cf_${key}`;
}

// ----------------------------------------------------------------------------
// Options
// ----------------------------------------------------------------------------

/** Textarea "one option per line" → trimmed, de-duplicated (case-sensitive), non-empty list. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const option = raw.trim();
    if (!option || seen.has(option)) continue;
    seen.add(option);
    options.push(option);
  }
  return options;
}

// ----------------------------------------------------------------------------
// Values
// ----------------------------------------------------------------------------

/** The slice of FormData this file reads. A test can pass a plain Map. */
export type FormValues = { get(name: string): FormDataEntryValue | null };

export type ParsedCustomFieldValues = {
  /** Keyed by field key. A field left blank is absent, not null. */
  values: Record<string, unknown>;
  /** One message per invalid field, in definition order. Empty means everything parsed. */
  errors: string[];
};

/**
 * Reads every defined field's `cf_<key>` input into a typed value. Blank
 * inputs are simply absent (the jsonb stays lean); an unchecked boolean is
 * stored as `false` so "No" is a real answer rather than "never asked".
 */
const BOOLEAN_TRUE = new Set(["true", "on", "yes", "y", "1"]);
const BOOLEAN_FALSE = new Set(["false", "off", "no", "n", "0"]);

export function parseCustomFieldValues(
  defs: Pick<EquipmentCustomField, "key" | "label" | "field_type" | "options">[],
  formData: FormValues
): ParsedCustomFieldValues {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const def of defs) {
    const raw = formData.get(customFieldInputName(def.key));
    const text = typeof raw === "string" ? raw.trim() : "";

    switch (def.field_type) {
      case "boolean": {
        // The form always posts "true"/"false" (unchecked included), so a
        // blank only comes from CSV/API — leave it absent rather than
        // inventing a "No". Accept the spellings a spreadsheet produces.
        if (!text) break;
        const lowered = text.toLowerCase();
        if (BOOLEAN_TRUE.has(lowered)) values[def.key] = true;
        else if (BOOLEAN_FALSE.has(lowered)) values[def.key] = false;
        else errors.push(`${def.label} must be yes or no`);
        break;
      }
      case "text":
        if (!text) break;
        if (text.length > MAX_FIELD_TEXT_LENGTH) {
          errors.push(`${def.label} must be ${MAX_FIELD_TEXT_LENGTH} characters or fewer`);
          break;
        }
        values[def.key] = text;
        break;
      case "number": {
        if (!text) break;
        const num = Number(text);
        if (!Number.isFinite(num)) {
          errors.push(`${def.label} must be a number`);
          break;
        }
        values[def.key] = num;
        break;
      }
      case "date":
        if (!text) break;
        if (parseDateOnly(text) === null) {
          errors.push(`${def.label} must be a valid date (YYYY-MM-DD)`);
          break;
        }
        values[def.key] = text;
        break;
      case "select":
        if (!text) break;
        if (!def.options.includes(text)) {
          errors.push(`${def.label} must be one of: ${def.options.join(", ")}`);
          break;
        }
        values[def.key] = text;
        break;
    }
  }

  return { values, errors };
}

/**
 * A stored value as it should read on the detail page, the scan page, or in a
 * CSV cell. Tolerant of whatever is in the jsonb — a definition's type can be
 * edited after values exist, so nothing here assumes the value matches.
 */
export function formatCustomFieldValue(
  def: Pick<EquipmentCustomField, "field_type">,
  value: unknown
): string {
  if (value === null || value === undefined || value === "") return "";
  if (def.field_type === "boolean") {
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value) === "true" ? "Yes" : "No";
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Labels of the fields whose value differs, in definition order — for the "Updated …" timeline summary. */
export function customFieldsDiff(
  defs: Pick<EquipmentCustomField, "key" | "label" | "field_type">[],
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): string[] {
  return defs
    .filter(
      (def) =>
        formatCustomFieldValue(def, before?.[def.key]) !== formatCustomFieldValue(def, after?.[def.key])
    )
    .map((def) => def.label);
}
