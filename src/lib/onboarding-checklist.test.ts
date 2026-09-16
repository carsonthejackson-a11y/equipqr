import { describe, expect, it } from "vitest";
import { requiredChecklistItemsDone } from "@/lib/onboarding-checklist";

describe("requiredChecklistItemsDone", () => {
  it("is false while any required item is not done", () => {
    expect(
      requiredChecklistItemsDone([{ done: true }, { done: false }, { done: true }])
    ).toBe(false);
  });

  it("is true once every required item is done", () => {
    expect(requiredChecklistItemsDone([{ done: true }, { done: true }])).toBe(true);
  });

  it("ignores optional items entirely, whether done or not", () => {
    expect(
      requiredChecklistItemsDone([
        { done: true },
        { done: false, optional: true },
      ])
    ).toBe(true);
  });

  it("is true for an empty list (every() on an empty array is vacuously true)", () => {
    expect(requiredChecklistItemsDone([])).toBe(true);
  });

  it("is true when only optional items are outstanding, even if none are done", () => {
    expect(
      requiredChecklistItemsDone([
        { done: false, optional: true },
        { done: false, optional: true },
      ])
    ).toBe(true);
  });
});
