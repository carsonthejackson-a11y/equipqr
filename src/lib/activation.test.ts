import { describe, expect, it } from "vitest";
import { daysBetween, earliestByCompany } from "./activation";

describe("earliestByCompany", () => {
  it("keeps the first row seen per company and ignores later duplicates", () => {
    const rows = [
      { company_id: "a", at: "2026-01-01T00:00:00Z" },
      { company_id: "b", at: "2026-01-02T00:00:00Z" },
      { company_id: "a", at: "2026-01-05T00:00:00Z" },
    ];
    const result = earliestByCompany(rows);
    expect(result.get("a")).toBe("2026-01-01T00:00:00Z");
    expect(result.get("b")).toBe("2026-01-02T00:00:00Z");
    expect(result.size).toBe(2);
  });

  it("returns an empty map for no rows", () => {
    expect(earliestByCompany([]).size).toBe(0);
  });

  it("is unaffected by a later duplicate sorting before an earlier one out of order", () => {
    // Real call sites always sort ascending first, so this documents the
    // "first seen wins" contract rather than testing sort-independence.
    const rows = [
      { company_id: "a", at: "2026-01-01T00:00:00Z" },
      { company_id: "a", at: "2025-01-01T00:00:00Z" },
    ];
    expect(earliestByCompany(rows).get("a")).toBe("2026-01-01T00:00:00Z");
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z")).toBe(2);
  });

  it("rounds partial days to the nearest whole day", () => {
    expect(daysBetween("2026-01-01T00:00:00Z", "2026-01-01T13:00:00Z")).toBe(1);
    expect(daysBetween("2026-01-01T00:00:00Z", "2026-01-01T11:00:00Z")).toBe(0);
  });

  it("can be negative when toIso is earlier than fromIso", () => {
    expect(daysBetween("2026-01-05T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(-4);
  });

  it("is null when either timestamp is missing or unparseable", () => {
    expect(daysBetween(null, "2026-01-01T00:00:00Z")).toBeNull();
    expect(daysBetween("2026-01-01T00:00:00Z", undefined)).toBeNull();
    expect(daysBetween("not a date", "2026-01-01T00:00:00Z")).toBeNull();
  });
});
