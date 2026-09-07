// Pure helpers for checklist templates + inspections (scan-to-inspect,
// migration 0019). No Supabase/network calls in this file — everything here
// is unit-testable and shared between the dashboard editor, the AI drafter
// action, and the staff-only /e/[qrToken]/inspect flow.
//
// Item/response shapes live in src/lib/types.ts (ChecklistItem,
// InspectionItem, InspectionItemResponse) — see the comments on
// checklist_templates/inspections in supabase/migrations/0019_next_roadmap_foundation.sql
// for the JSON contract those types describe.

import { z } from "zod";
import type { ChecklistItem, ChecklistItemKind, InspectionItem, InspectionItemResponse } from "@/lib/types";

export const CHECKLIST_ITEM_KINDS: ChecklistItemKind[] = ["check", "pass_fail", "text", "number", "photo"];

export const CHECKLIST_ITEM_KIND_LABELS: Record<ChecklistItemKind, string> = {
  check: "Checkbox",
  pass_fail: "Pass / fail",
  text: "Text",
  number: "Number",
  photo: "Photo",
};

// ----------------------------------------------------------------------------
// Template item validation (checklist_templates.items)
// ----------------------------------------------------------------------------

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, "Every item needs a label").max(200),
  kind: z.enum(["check", "pass_fail", "text", "number", "photo"]),
  required: z.boolean(),
  help: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((value) => value || null),
});

/** At least one item — a checklist with zero items isn't worth saving. */
export const checklistItemsSchema = z.array(checklistItemSchema).min(1, "Add at least one item");

export function newItemId(): string {
  return crypto.randomUUID();
}

export function emptyChecklistItem(kind: ChecklistItemKind = "check"): ChecklistItem {
  return { id: newItemId(), label: "", kind, required: false, help: null };
}

// ----------------------------------------------------------------------------
// Inspection responses (inspections.items)
// ----------------------------------------------------------------------------

function emptyResponse(): InspectionItemResponse {
  return { value: null, passed: null, note: null, photo_paths: [] };
}

/** Snapshots a template's items into a fresh inspection with empty responses. */
export function createInspectionItems(items: ChecklistItem[]): InspectionItem[] {
  return items.map((item) => ({ ...item, response: emptyResponse() }));
}

const inspectionResponseSchema = z.object({
  value: z.union([z.boolean(), z.string(), z.number(), z.null()]),
  passed: z.boolean().nullable(),
  note: z.string().nullable(),
  photo_paths: z.array(z.string()),
});

/**
 * Looser than checklistItemsSchema — an in-progress inspection is a snapshot
 * of a template item (so the label/kind/help came from the AI drafter or a
 * hand-built template already validated once) plus a response that changes
 * on every autosave. Used to sanity-check the shape before it's written back.
 */
export const inspectionItemsSchema = z.array(
  checklistItemSchema.omit({ help: true }).extend({
    help: z.string().nullable(),
    response: inspectionResponseSchema,
  })
);

/**
 * Derives the pass/fail state for an item from its current value — the one
 * place that decision is made, so the client UI and any server-side
 * re-derivation never disagree.
 *
 *  - check: unchecked only counts as a fail when the item is required;
 *    an optional unchecked box is simply "not applicable", not a failure.
 *  - pass_fail: an explicit Pass/Fail choice maps straight across.
 *  - text/number/photo: no pass/fail concept — always null. Whether they were
 *    *answered* at all is validateResponses()'s job, not this function's.
 */
export function deriveItemPassed(
  kind: ChecklistItemKind,
  value: InspectionItemResponse["value"],
  required: boolean
): boolean | null {
  if (kind === "check") {
    if (value === true) return true;
    if (value === false) return required ? false : null;
    return null;
  }
  if (kind === "pass_fail") {
    if (value === "pass") return true;
    if (value === "fail") return false;
    return null;
  }
  return null;
}

/** Applies a new value to an item, recomputing `passed` from it in one step. */
export function applyItemValue(item: InspectionItem, value: InspectionItemResponse["value"]): InspectionItem {
  return {
    ...item,
    response: {
      ...item.response,
      value,
      passed: deriveItemPassed(item.kind, value, item.required),
    },
  };
}

export type InspectionSummary = { failedCount: number; failedLabels: string[] };

/** What shows on the completion screen and gets stamped onto inspections.failed_count. */
export function summarizeInspection(items: InspectionItem[]): InspectionSummary {
  const failed = items.filter((item) => item.response.passed === false);
  return { failedCount: failed.length, failedLabels: failed.map((item) => item.label) };
}

/** True when every failed item that counted toward the total was `required` — used to set follow-up request priority. */
export function anyFailedItemRequired(items: InspectionItem[]): boolean {
  return items.some((item) => item.response.passed === false && item.required);
}

export type ResponseValidation = { valid: boolean; missingLabels: string[] };

/**
 * Which required items still need an answer before an inspection can be
 * completed. A `check` item is always "answered" (false is a legitimate,
 * completed answer — it just fails) — see deriveItemPassed().
 */
export function validateResponses(items: InspectionItem[]): ResponseValidation {
  const missing = items.filter((item) => {
    if (!item.required) return false;
    const { value, photo_paths } = item.response;
    switch (item.kind) {
      case "check":
        return value !== true && value !== false;
      case "pass_fail":
        return value !== "pass" && value !== "fail";
      case "text":
        return typeof value !== "string" || value.trim().length === 0;
      case "number":
        return typeof value !== "number" || Number.isNaN(value);
      case "photo":
        return photo_paths.length === 0;
      default:
        return false;
    }
  });
  return { valid: missing.length === 0, missingLabels: missing.map((item) => item.label) };
}

/** Builds the description for a "N items failed" follow-up service request. */
export function buildFailedItemsDescription(templateName: string, items: InspectionItem[]): string {
  const failed = items.filter((item) => item.response.passed === false);
  const lines = failed.map((item) => {
    const note = item.response.note?.trim();
    return note ? `- ${item.label}: ${note}` : `- ${item.label}`;
  });
  return [`Failed inspection items from "${templateName}":`, "", ...lines].join("\n");
}
