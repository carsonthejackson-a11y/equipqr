import { describe, expect, it } from "vitest";
import { RESTAURANT_EQUIPMENT_TEMPLATES } from "./owner-templates";

const MAX_CHIP_LENGTH = 40;

describe("RESTAURANT_EQUIPMENT_TEMPLATES", () => {
  it("has exactly 12 entries", () => {
    expect(RESTAURANT_EQUIPMENT_TEMPLATES).toHaveLength(12);
  });

  it("has case-insensitively unique names", () => {
    const names = RESTAURANT_EQUIPMENT_TEMPLATES.map((t) => t.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every entry at least 6 symptom chips", () => {
    for (const template of RESTAURANT_EQUIPMENT_TEMPLATES) {
      expect(template.symptom_chips.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("keeps every chip at or under 40 characters", () => {
    for (const template of RESTAURANT_EQUIPMENT_TEMPLATES) {
      for (const chip of template.symptom_chips) {
        expect(chip.length).toBeLessThanOrEqual(MAX_CHIP_LENGTH);
      }
    }
  });

  it("never repeats a chip within one type", () => {
    for (const template of RESTAURANT_EQUIPMENT_TEMPLATES) {
      expect(new Set(template.symptom_chips).size).toBe(template.symptom_chips.length);
    }
  });

  it("gives every entry a non-empty description", () => {
    for (const template of RESTAURANT_EQUIPMENT_TEMPLATES) {
      expect(template.description.trim().length).toBeGreaterThan(0);
    }
  });
});
