import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_TEMPLATE_ID,
  LABEL_TEMPLATES,
  LABEL_TEMPLATE_LIST,
  POINTS_PER_INCH,
  cellRect,
  getLabelTemplate,
  isLabelTemplateId,
  labelSlots,
  labelsPerSheet,
  sheetCount,
  truncateToWidth,
} from "./templates";

describe("template geometry invariants", () => {
  for (const template of LABEL_TEMPLATE_LIST) {
    describe(template.id, () => {
      it("has a gutter that is never negative", () => {
        expect(template.pitch.x).toBeGreaterThanOrEqual(template.label.width);
        expect(template.pitch.y).toBeGreaterThanOrEqual(template.label.height);
      });

      it("fits the sheet horizontally with equal side margins", () => {
        const lastColumnRight =
          template.margin.left + (template.columns - 1) * template.pitch.x + template.label.width;
        const rightMargin = template.page.width - lastColumnRight;
        expect(rightMargin).toBeGreaterThanOrEqual(0);
        // Avery sheets centre their columns; a mismatch means a typo in the spec.
        expect(rightMargin).toBeCloseTo(template.margin.left, 6);
      });

      it("fits the sheet vertically", () => {
        const lastRowBottom =
          template.margin.top + (template.rows - 1) * template.pitch.y + template.label.height;
        expect(lastRowBottom).toBeLessThanOrEqual(template.page.height);
      });

      it("prints on US Letter", () => {
        expect(template.page.width).toBe(8.5 * POINTS_PER_INCH);
        expect(template.page.height).toBe(11 * POINTS_PER_INCH);
      });
    });
  }
});

describe("known Avery counts and sizes", () => {
  it("5160 is 30 up at 2.625in x 1in", () => {
    const t = LABEL_TEMPLATES.avery5160;
    expect(labelsPerSheet(t)).toBe(30);
    expect(t.label.width).toBeCloseTo(189, 6);
    expect(t.label.height).toBeCloseTo(72, 6);
  });

  it("5163 is 10 up at 4in x 2in", () => {
    const t = LABEL_TEMPLATES.avery5163;
    expect(labelsPerSheet(t)).toBe(10);
    expect(t.label.width).toBeCloseTo(288, 6);
    expect(t.label.height).toBeCloseTo(144, 6);
  });

  it("22806 is 12 up and square", () => {
    const t = LABEL_TEMPLATES.avery22806;
    expect(labelsPerSheet(t)).toBe(12);
    expect(t.label.width).toBe(t.label.height);
    expect(t.label.width).toBeCloseTo(144, 6);
  });
});

describe("cellRect", () => {
  const t = LABEL_TEMPLATES.avery5160;

  it("puts label 0 at the top-left, in PDF (bottom-left origin) coordinates", () => {
    const rect = cellRect(t, 0);
    expect(rect.x).toBeCloseTo(t.margin.left, 6);
    expect(rect.y).toBeCloseTo(t.page.height - t.margin.top - t.label.height, 6);
    expect(rect.width).toBeCloseTo(t.label.width, 6);
    expect(rect.height).toBeCloseTo(t.label.height, 6);
  });

  it("fills left to right before moving down a row", () => {
    const first = cellRect(t, 0);
    const second = cellRect(t, 1);
    const third = cellRect(t, 2);
    const fourth = cellRect(t, 3);

    expect(second.x).toBeCloseTo(first.x + t.pitch.x, 6);
    expect(second.y).toBeCloseTo(first.y, 6);
    expect(third.x).toBeCloseTo(first.x + 2 * t.pitch.x, 6);
    // Row 2 starts back at the left, one pitch lower (lower y in PDF space).
    expect(fourth.x).toBeCloseTo(first.x, 6);
    expect(fourth.y).toBeCloseTo(first.y - t.pitch.y, 6);
  });

  it("keeps the last label on the page", () => {
    const last = cellRect(t, labelsPerSheet(t) - 1);
    expect(last.y).toBeGreaterThanOrEqual(0);
    expect(last.x + last.width).toBeLessThanOrEqual(t.page.width + 1e-6);
  });

  it("rejects an index outside the sheet", () => {
    expect(() => cellRect(t, -1)).toThrow(RangeError);
    expect(() => cellRect(t, labelsPerSheet(t))).toThrow(RangeError);
    expect(() => cellRect(t, 1.5)).toThrow(RangeError);
  });
});

describe("sheetCount", () => {
  const t = LABEL_TEMPLATES.avery5163; // 10 up

  it("is 0 for nothing to print", () => {
    expect(sheetCount(t, 0)).toBe(0);
    expect(sheetCount(t, -3)).toBe(0);
  });

  it("rounds partial sheets up", () => {
    expect(sheetCount(t, 1)).toBe(1);
    expect(sheetCount(t, 10)).toBe(1);
    expect(sheetCount(t, 11)).toBe(2);
    expect(sheetCount(t, 25)).toBe(3);
  });
});

describe("labelSlots", () => {
  const t = LABEL_TEMPLATES.avery22806; // 12 up

  it("returns one slot per label", () => {
    expect(labelSlots(t, 7)).toHaveLength(7);
    expect(labelSlots(t, 0)).toHaveLength(0);
  });

  it("wraps onto the next sheet and restarts at index 0", () => {
    const slots = labelSlots(t, 14);
    expect(slots[11].page).toBe(0);
    expect(slots[11].index).toBe(11);
    expect(slots[12].page).toBe(1);
    expect(slots[12].index).toBe(0);
    // The first label of sheet 2 sits exactly where the first of sheet 1 did.
    expect(slots[12].x).toBeCloseTo(slots[0].x, 6);
    expect(slots[12].y).toBeCloseTo(slots[0].y, 6);
  });

  it("agrees with sheetCount", () => {
    const slots = labelSlots(t, 25);
    expect(slots[slots.length - 1].page + 1).toBe(sheetCount(t, 25));
  });
});

describe("getLabelTemplate / isLabelTemplateId", () => {
  it("recognises known ids", () => {
    expect(isLabelTemplateId("avery5160")).toBe(true);
    expect(isLabelTemplateId("avery9999")).toBe(false);
    expect(isLabelTemplateId(null)).toBe(false);
  });

  it("falls back to the default for junk input", () => {
    expect(getLabelTemplate("avery5163").id).toBe("avery5163");
    expect(getLabelTemplate("nope").id).toBe(DEFAULT_LABEL_TEMPLATE_ID);
    expect(getLabelTemplate(undefined).id).toBe(DEFAULT_LABEL_TEMPLATE_ID);
  });
});

describe("truncateToWidth", () => {
  // Fixed-width stand-in for a real font metric: 10 units per character.
  const measure = (s: string) => s.length * 10;

  it("leaves text that already fits alone", () => {
    expect(truncateToWidth("Boiler 3", 200, measure)).toBe("Boiler 3");
    expect(truncateToWidth("Boiler 3", 80, measure)).toBe("Boiler 3");
  });

  it("cuts with an ellipsis and stays within the budget", () => {
    const result = truncateToWidth("Break room water heater", 80, measure);
    expect(result.endsWith("…")).toBe(true);
    expect(measure(result)).toBeLessThanOrEqual(80);
  });

  it("does not leave a trailing space before the ellipsis", () => {
    const result = truncateToWidth("Roof unit A", 70, measure);
    expect(result).not.toMatch(/ …$/);
  });

  it("returns empty when even an ellipsis will not fit", () => {
    expect(truncateToWidth("anything", 5, measure)).toBe("");
    expect(truncateToWidth("anything", 0, measure)).toBe("");
  });
});
