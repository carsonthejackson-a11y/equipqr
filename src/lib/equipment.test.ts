import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  daysUntilDate,
  diffEquipment,
  equipmentUpdateSummary,
  formatWarranty,
  isAllowedDocumentType,
  normalizeDateInput,
  parseDateOnly,
  parseEquipmentStatus,
  statusChangeSummary,
  warrantyState,
  type EquipmentPatch,
} from "@/lib/equipment";

const base: EquipmentPatch = {
  name: "Boiler 1",
  equipment_type_id: "type-a",
  customer_id: "cust-a",
  make: "Rheem",
  model: "XG40",
  serial_number: "SN-1",
  location: "Basement",
  address: "120 Main St",
  contact_name: "Dana",
  contact_phone: "555-0142",
  install_date: "2024-03-18",
  warranty_ends_on: "2029-03-18",
  status: "active",
  notes: null,
};

describe("diffEquipment", () => {
  it("finds nothing when nothing changed", () => {
    expect(diffEquipment(base, { ...base })).toEqual([]);
  });

  it("lists changed fields in a stable order", () => {
    const after: EquipmentPatch = { ...base, status: "needs_service", make: "Bradford White" };
    expect(diffEquipment(base, after)).toEqual(["make", "status"]);
  });

  it("treats null, undefined, empty string and whitespace as the same value", () => {
    expect(diffEquipment({ ...base, notes: null }, { ...base, notes: "" })).toEqual([]);
    expect(diffEquipment({ ...base, model: "XG40" }, { ...base, model: "  XG40  " })).toEqual([]);
    expect(diffEquipment({ ...base, customer_id: null }, { ...base, customer_id: "cust-a" })).toEqual([
      "customer_id",
    ]);
  });

  it("notices a value being cleared", () => {
    expect(diffEquipment(base, { ...base, serial_number: null })).toEqual(["serial_number"]);
  });
});

describe("equipmentUpdateSummary", () => {
  it("reads as a sentence for one, two and many fields", () => {
    expect(equipmentUpdateSummary(["make"])).toBe("Updated make");
    expect(equipmentUpdateSummary(["make", "model"])).toBe("Updated make and model");
    expect(equipmentUpdateSummary(["make", "model", "status"])).toBe(
      "Updated make, model and status"
    );
  });

  it("falls back when the diff is empty", () => {
    expect(equipmentUpdateSummary([])).toBe("Details updated");
  });

  it("uses human labels, not column names", () => {
    expect(equipmentUpdateSummary(["equipment_type_id", "warranty_ends_on"])).toBe(
      "Updated equipment type and warranty end date"
    );
  });
});

describe("statusChangeSummary", () => {
  it("renders both labels with an arrow", () => {
    expect(statusChangeSummary("active", "needs_service")).toBe("Status: Active → Needs service");
    expect(statusChangeSummary("out_of_service", "retired")).toBe("Status: Out of service → Retired");
  });
});

describe("parseDateOnly", () => {
  it("accepts real calendar dates", () => {
    expect(parseDateOnly("2024-03-18")).toBe(Date.UTC(2024, 2, 18));
  });

  it("rejects impossible and malformed dates", () => {
    expect(parseDateOnly("2025-02-30")).toBeNull();
    expect(parseDateOnly("2025-13-01")).toBeNull();
    expect(parseDateOnly("18/03/2024")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
  });
});

describe("normalizeDateInput", () => {
  it("passes through ISO dates", () => {
    expect(normalizeDateInput("2024-03-18")).toEqual({ ok: true, value: "2024-03-18" });
  });

  it("canonicalises US-style dates", () => {
    expect(normalizeDateInput("3/8/2024")).toEqual({ ok: true, value: "2024-03-08" });
    expect(normalizeDateInput("12/31/2024")).toEqual({ ok: true, value: "2024-12-31" });
  });

  it("treats a blank cell as no date", () => {
    expect(normalizeDateInput("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects garbage", () => {
    expect(normalizeDateInput("next tuesday")).toEqual({ ok: false });
    expect(normalizeDateInput("2024-02-31")).toEqual({ ok: false });
  });
});

describe("warranty helpers", () => {
  const now = new Date("2026-09-05T12:00:00Z");

  it("counts whole days from today, in UTC", () => {
    expect(daysUntilDate("2026-09-05", now)).toBe(0);
    expect(daysUntilDate("2026-09-15", now)).toBe(10);
    expect(daysUntilDate("2026-09-01", now)).toBe(-4);
    expect(daysUntilDate(null, now)).toBeNull();
  });

  it("classifies expired, expiring-soon and comfortably-covered", () => {
    expect(warrantyState(null, now)).toEqual({ state: "none" });
    expect(warrantyState("2026-08-24", now)).toEqual({ state: "expired", days: 12 });
    expect(warrantyState("2026-09-05", now)).toEqual({ state: "soon", days: 0 });
    expect(warrantyState("2026-10-05", now)).toEqual({ state: "soon", days: 30 });
    expect(warrantyState("2026-10-06", now)).toEqual({ state: "active", days: 31 });
  });

  it("formats for the detail page", () => {
    expect(formatWarranty(null, now)).toBeNull();
    expect(formatWarranty("2026-09-05", now)).toBe("Warranty: expires today");
    expect(formatWarranty("2026-09-06", now)).toBe("Warranty: expires in 1 day");
    expect(formatWarranty("2026-09-15", now)).toBe("Warranty: expires in 10 days");
    expect(formatWarranty("2026-09-04", now)).toBe("Warranty: expired 1 day ago");
    expect(formatWarranty("2026-08-24", now)).toBe("Warranty: expired 12 days ago");
  });
});

describe("parseEquipmentStatus", () => {
  it("accepts stored values and labels", () => {
    expect(parseEquipmentStatus("active")).toBe("active");
    expect(parseEquipmentStatus("needs_service")).toBe("needs_service");
    expect(parseEquipmentStatus("Needs service")).toBe("needs_service");
    expect(parseEquipmentStatus("OUT OF SERVICE")).toBe("out_of_service");
    expect(parseEquipmentStatus("out-of-service")).toBe("out_of_service");
  });

  it("defaults a blank cell to active", () => {
    expect(parseEquipmentStatus("")).toBe("active");
  });

  it("rejects unknown statuses", () => {
    expect(parseEquipmentStatus("broken")).toBeNull();
  });
});

describe("document constraints", () => {
  it("caps documents at 25MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it("allows the documented types and nothing else", () => {
    expect(ALLOWED_DOCUMENT_MIME_TYPES).toContain("application/pdf");
    expect(isAllowedDocumentType("application/pdf")).toBe(true);
    expect(isAllowedDocumentType("image/png")).toBe(true);
    expect(isAllowedDocumentType("video/mp4")).toBe(false);
    expect(isAllowedDocumentType("application/x-msdownload")).toBe(false);
  });

  it("lets a browser-unknown type through — the size cap and RLS still apply", () => {
    expect(isAllowedDocumentType("")).toBe(true);
    expect(isAllowedDocumentType(null)).toBe(true);
  });
});
