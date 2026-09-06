import { describe, expect, it } from "vitest";
import {
  anyFailedItemRequired,
  applyItemValue,
  buildFailedItemsDescription,
  checklistItemsSchema,
  createInspectionItems,
  deriveItemPassed,
  emptyChecklistItem,
  newItemId,
  summarizeInspection,
  validateResponses,
} from "./checklists";
import type { ChecklistItem, InspectionItem } from "@/lib/types";

function item(overrides: Partial<InspectionItem>): InspectionItem {
  return {
    id: "i1",
    label: "Check something",
    kind: "check",
    required: false,
    help: null,
    response: { value: null, passed: null, note: null, photo_paths: [] },
    ...overrides,
  };
}

describe("newItemId / emptyChecklistItem", () => {
  it("generates unique ids", () => {
    expect(newItemId()).not.toBe(newItemId());
  });

  it("defaults to a 'check' kind, blank label, not required", () => {
    const created = emptyChecklistItem();
    expect(created.kind).toBe("check");
    expect(created.label).toBe("");
    expect(created.required).toBe(false);
    expect(created.help).toBeNull();
    expect(created.id).toHaveLength(36);
  });
});

describe("checklistItemsSchema", () => {
  const valid: ChecklistItem[] = [
    { id: "1", label: "Check filter", kind: "check", required: true, help: null },
  ];

  it("accepts a well-formed item list", () => {
    const result = checklistItemsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an empty list", () => {
    const result = checklistItemsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("rejects a blank label", () => {
    const result = checklistItemsSchema.safeParse([{ ...valid[0], label: "   " }]);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = checklistItemsSchema.safeParse([{ ...valid[0], kind: "bogus" }]);
    expect(result.success).toBe(false);
  });

  it("normalizes an empty help string to null", () => {
    const result = checklistItemsSchema.safeParse([{ ...valid[0], help: "  " }]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].help).toBeNull();
    }
  });
});

describe("createInspectionItems", () => {
  it("snapshots template items with empty responses", () => {
    const templateItems: ChecklistItem[] = [
      { id: "1", label: "Descale", kind: "check", required: true, help: "Use citric acid" },
    ];
    const snapshot = createInspectionItems(templateItems);
    expect(snapshot).toEqual([
      {
        id: "1",
        label: "Descale",
        kind: "check",
        required: true,
        help: "Use citric acid",
        response: { value: null, passed: null, note: null, photo_paths: [] },
      },
    ]);
  });
});

describe("deriveItemPassed", () => {
  it("check: true passes regardless of required", () => {
    expect(deriveItemPassed("check", true, true)).toBe(true);
    expect(deriveItemPassed("check", true, false)).toBe(true);
  });

  it("check: false fails only when required", () => {
    expect(deriveItemPassed("check", false, true)).toBe(false);
    expect(deriveItemPassed("check", false, false)).toBeNull();
  });

  it("check: no value yet is null", () => {
    expect(deriveItemPassed("check", null, true)).toBeNull();
  });

  it("pass_fail maps 'pass'/'fail' straight across", () => {
    expect(deriveItemPassed("pass_fail", "pass", true)).toBe(true);
    expect(deriveItemPassed("pass_fail", "fail", true)).toBe(false);
    expect(deriveItemPassed("pass_fail", null, true)).toBeNull();
  });

  it("text/number/photo never carry a pass/fail state", () => {
    expect(deriveItemPassed("text", "looks fine", true)).toBeNull();
    expect(deriveItemPassed("number", 42, true)).toBeNull();
    expect(deriveItemPassed("photo", null, true)).toBeNull();
  });
});

describe("applyItemValue", () => {
  it("sets the value and recomputes passed together", () => {
    const before = item({ kind: "pass_fail", required: true });
    const after = applyItemValue(before, "fail");
    expect(after.response.value).toBe("fail");
    expect(after.response.passed).toBe(false);
    // Original untouched.
    expect(before.response.value).toBeNull();
  });
});

describe("summarizeInspection", () => {
  it("counts only items whose response.passed is explicitly false", () => {
    const items = [
      item({ id: "1", label: "A", response: { value: true, passed: true, note: null, photo_paths: [] } }),
      item({ id: "2", label: "B", response: { value: false, passed: false, note: "leaking", photo_paths: [] } }),
      item({ id: "3", label: "C", kind: "text", response: { value: "fine", passed: null, note: null, photo_paths: [] } }),
    ];
    expect(summarizeInspection(items)).toEqual({ failedCount: 1, failedLabels: ["B"] });
  });

  it("returns zero for an all-clear inspection", () => {
    const items = [item({ response: { value: true, passed: true, note: null, photo_paths: [] } })];
    expect(summarizeInspection(items)).toEqual({ failedCount: 0, failedLabels: [] });
  });
});

describe("anyFailedItemRequired", () => {
  it("is true when a failed item was required", () => {
    const items = [item({ required: true, response: { value: false, passed: false, note: null, photo_paths: [] } })];
    expect(anyFailedItemRequired(items)).toBe(true);
  });

  it("is false when every failed item was optional", () => {
    const items = [
      item({
        kind: "pass_fail",
        required: false,
        response: { value: "fail", passed: false, note: null, photo_paths: [] },
      }),
    ];
    expect(anyFailedItemRequired(items)).toBe(false);
  });
});

describe("validateResponses", () => {
  it("check items are always answered — false is a completed (failing) answer", () => {
    const items = [item({ required: true, response: { value: false, passed: false, note: null, photo_paths: [] } })];
    expect(validateResponses(items)).toEqual({ valid: true, missingLabels: [] });
  });

  it("flags a required pass_fail item with no choice made", () => {
    const items = [item({ kind: "pass_fail", required: true, label: "Gasket" })];
    expect(validateResponses(items)).toEqual({ valid: false, missingLabels: ["Gasket"] });
  });

  it("flags a required text item that's blank or whitespace", () => {
    const items = [
      item({
        kind: "text",
        required: true,
        label: "Notes",
        response: { value: "   ", passed: null, note: null, photo_paths: [] },
      }),
    ];
    expect(validateResponses(items).valid).toBe(false);
  });

  it("flags a required number item with NaN or no value", () => {
    const items = [item({ kind: "number", required: true, label: "Pressure" })];
    expect(validateResponses(items).valid).toBe(false);
  });

  it("flags a required photo item with no photos", () => {
    const items = [item({ kind: "photo", required: true, label: "Nameplate" })];
    expect(validateResponses(items).valid).toBe(false);
  });

  it("never flags an optional item", () => {
    const items = [item({ kind: "pass_fail", required: false, label: "Optional" })];
    expect(validateResponses(items)).toEqual({ valid: true, missingLabels: [] });
  });

  it("passes a fully-answered checklist", () => {
    const items = [
      item({ kind: "check", required: true, response: { value: true, passed: true, note: null, photo_paths: [] } }),
      item({
        id: "2",
        kind: "photo",
        required: true,
        label: "Photo",
        response: { value: null, passed: null, note: null, photo_paths: ["a.jpg"] },
      }),
    ];
    expect(validateResponses(items)).toEqual({ valid: true, missingLabels: [] });
  });
});

describe("buildFailedItemsDescription", () => {
  it("lists failed items with their notes", () => {
    const items = [
      item({
        id: "1",
        label: "Descale boiler",
        response: { value: false, passed: false, note: "Heavy scale buildup", photo_paths: [] },
      }),
      item({
        id: "2",
        label: "Group gasket",
        response: { value: true, passed: true, note: null, photo_paths: [] },
      }),
      item({
        id: "3",
        label: "Steam wand tip",
        kind: "pass_fail",
        response: { value: "fail", passed: false, note: null, photo_paths: [] },
      }),
    ];
    const description = buildFailedItemsDescription("90-day PM", items);
    expect(description).toContain('Failed inspection items from "90-day PM":');
    expect(description).toContain("- Descale boiler: Heavy scale buildup");
    expect(description).toContain("- Steam wand tip");
    expect(description).not.toContain("Group gasket");
  });
});
