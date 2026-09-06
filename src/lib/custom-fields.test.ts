import { describe, expect, it } from "vitest";
import {
  MAX_FIELD_TEXT_LENGTH,
  customFieldsDiff,
  formatCustomFieldValue,
  isValidFieldKey,
  parseCustomFieldValues,
  parseOptions,
  slugifyFieldKey,
} from "@/lib/custom-fields";
import type { EquipmentCustomField } from "@/lib/types";

function def(overrides: Partial<EquipmentCustomField> & { key: string }): EquipmentCustomField {
  return {
    id: `id-${overrides.key}`,
    company_id: "co-a",
    label: overrides.key,
    field_type: "text",
    options: [],
    help_text: null,
    show_on_scan_page: false,
    sort_order: 0,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/** A FormData stand-in: the parser only calls get(). */
function form(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return { get: (name: string) => map.get(name) ?? null };
}

describe("slugifyFieldKey", () => {
  it("lowercases and collapses punctuation to single underscores", () => {
    expect(slugifyFieldKey("Filter size")).toBe("filter_size");
    expect(slugifyFieldKey("  Filter  size (in) ")).toBe("filter_size_in");
    expect(slugifyFieldKey("Asset-Tag #")).toBe("asset_tag");
  });

  it("strips accents", () => {
    expect(slugifyFieldKey("Número de série")).toBe("numero_de_serie");
  });

  it("prefixes keys that would start with a digit", () => {
    expect(slugifyFieldKey("2nd compressor")).toBe("f_2nd_compressor");
  });

  it("caps at 40 characters without a dangling underscore", () => {
    const key = slugifyFieldKey("a".repeat(39) + " b");
    expect(key).toBe("a".repeat(39));
    expect(isValidFieldKey(key)).toBe(true);
  });

  it("yields an empty string when nothing usable is left", () => {
    expect(slugifyFieldKey("!!!")).toBe("");
  });

  it("always produces a DB-valid key from a real label", () => {
    for (const label of ["Filter size", "Voltage (V)", "Ünïcödé", "9 lives", "x"]) {
      expect(isValidFieldKey(slugifyFieldKey(label))).toBe(true);
    }
  });
});

describe("isValidFieldKey", () => {
  it("matches the DB slug rule", () => {
    expect(isValidFieldKey("filter_size")).toBe(true);
    expect(isValidFieldKey("a")).toBe(true);
    expect(isValidFieldKey("a".repeat(40))).toBe(true);
    expect(isValidFieldKey("a".repeat(41))).toBe(false);
    expect(isValidFieldKey("Filter")).toBe(false);
    expect(isValidFieldKey("1abc")).toBe(false);
    expect(isValidFieldKey("_abc")).toBe(false);
    expect(isValidFieldKey("")).toBe(false);
  });
});

describe("parseOptions", () => {
  it("splits lines, trims, drops blanks and duplicates, keeps order", () => {
    expect(parseOptions("16x20\r\n 20x25 \n\n16x20\n")).toEqual(["16x20", "20x25"]);
    expect(parseOptions("")).toEqual([]);
  });
});

describe("parseCustomFieldValues", () => {
  const defs = [
    def({ key: "asset_tag", label: "Asset tag", field_type: "text" }),
    def({ key: "btu", label: "BTU", field_type: "number" }),
    def({ key: "inspected_on", label: "Inspected on", field_type: "date" }),
    def({ key: "filter_size", label: "Filter size", field_type: "select", options: ["16x20", "20x25"] }),
    def({ key: "has_drain_pan", label: "Has drain pan", field_type: "boolean" }),
  ];

  it("reads every type from cf_<key> inputs", () => {
    const { values, errors } = parseCustomFieldValues(
      defs,
      form({
        cf_asset_tag: "  A-100 ",
        cf_btu: "36000",
        cf_inspected_on: "2026-08-01",
        cf_filter_size: "20x25",
        cf_has_drain_pan: "true",
      })
    );
    expect(errors).toEqual([]);
    expect(values).toEqual({
      asset_tag: "A-100",
      btu: 36000,
      inspected_on: "2026-08-01",
      filter_size: "20x25",
      has_drain_pan: true,
    });
  });

  it("leaves blank fields absent — including a boolean nobody answered (CSV / API)", () => {
    const { values, errors } = parseCustomFieldValues(defs, form({}));
    expect(errors).toEqual([]);
    expect(values).toEqual({});
  });

  it("reads booleans the way a form, a checkbox and a spreadsheet spell them", () => {
    for (const yes of ["true", "on", "Yes", "YES", "y", "1"]) {
      expect(parseCustomFieldValues(defs, form({ cf_has_drain_pan: yes })).values.has_drain_pan).toBe(true);
    }
    for (const no of ["false", "off", "No", "n", "0"]) {
      expect(parseCustomFieldValues(defs, form({ cf_has_drain_pan: no })).values.has_drain_pan).toBe(false);
    }
    const { values, errors } = parseCustomFieldValues(defs, form({ cf_has_drain_pan: "maybe" }));
    expect(values).not.toHaveProperty("has_drain_pan");
    expect(errors).toEqual(["Has drain pan must be yes or no"]);
  });

  it("round-trips the export's Yes/No through the importer", () => {
    const def = defs.find((d) => d.key === "has_drain_pan")!;
    for (const value of [true, false]) {
      const exported = formatCustomFieldValue(def, value);
      expect(parseCustomFieldValues(defs, form({ cf_has_drain_pan: exported })).values.has_drain_pan).toBe(value);
    }
  });

  it("reports one readable error per bad value, in definition order", () => {
    const { values, errors } = parseCustomFieldValues(
      defs,
      form({
        cf_asset_tag: "x".repeat(MAX_FIELD_TEXT_LENGTH + 1),
        cf_btu: "lots",
        cf_inspected_on: "2026-02-30",
        cf_filter_size: "24x24",
      })
    );
    expect(errors).toEqual([
      `Asset tag must be ${MAX_FIELD_TEXT_LENGTH} characters or fewer`,
      "BTU must be a number",
      "Inspected on must be a valid date (YYYY-MM-DD)",
      "Filter size must be one of: 16x20, 20x25",
    ]);
    expect(values).toEqual({});
  });

  it("ignores inputs for keys that aren't defined", () => {
    const { values } = parseCustomFieldValues(defs, form({ cf_ghost: "boo" }));
    expect(values).not.toHaveProperty("ghost");
  });
});

describe("formatCustomFieldValue", () => {
  it("renders each type for display", () => {
    expect(formatCustomFieldValue(def({ key: "t" }), "hello")).toBe("hello");
    expect(formatCustomFieldValue(def({ key: "n", field_type: "number" }), 42)).toBe("42");
    expect(formatCustomFieldValue(def({ key: "d", field_type: "date" }), "2026-08-01")).toBe("2026-08-01");
    expect(formatCustomFieldValue(def({ key: "b", field_type: "boolean" }), true)).toBe("Yes");
    expect(formatCustomFieldValue(def({ key: "b", field_type: "boolean" }), false)).toBe("No");
  });

  it("renders nothing for missing values", () => {
    expect(formatCustomFieldValue(def({ key: "t" }), null)).toBe("");
    expect(formatCustomFieldValue(def({ key: "t" }), undefined)).toBe("");
    expect(formatCustomFieldValue(def({ key: "t" }), "")).toBe("");
  });

  it("tolerates a value that doesn't match the current type", () => {
    expect(formatCustomFieldValue(def({ key: "b", field_type: "boolean" }), "true")).toBe("Yes");
    expect(formatCustomFieldValue(def({ key: "n", field_type: "number" }), "abc")).toBe("abc");
    expect(formatCustomFieldValue(def({ key: "t" }), 7)).toBe("7");
  });
});

describe("customFieldsDiff", () => {
  const defs = [
    def({ key: "asset_tag", label: "Asset tag" }),
    def({ key: "btu", label: "BTU", field_type: "number" }),
    def({ key: "has_drain_pan", label: "Has drain pan", field_type: "boolean" }),
  ];

  it("lists changed labels in definition order", () => {
    expect(
      customFieldsDiff(defs, { asset_tag: "A", btu: 1, has_drain_pan: false }, { asset_tag: "B", btu: 1, has_drain_pan: true })
    ).toEqual(["Asset tag", "Has drain pan"]);
  });

  it("treats absent, null and empty as the same, and missing objects as empty", () => {
    expect(customFieldsDiff(defs, { asset_tag: null }, {})).toEqual([]);
    expect(customFieldsDiff(defs, null, { asset_tag: "" })).toEqual([]);
    expect(customFieldsDiff(defs, undefined, { asset_tag: "A" })).toEqual(["Asset tag"]);
  });

  it("ignores keys without a definition", () => {
    expect(customFieldsDiff(defs, { old_key: "x" }, {})).toEqual([]);
  });
});
