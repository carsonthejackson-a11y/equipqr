import { describe, expect, it } from "vitest";
import { companyFormatters } from "@/lib/company-formatters";

// The individual date/time formatting rules already have thorough coverage
// in format.test.ts — this just confirms companyFormatters() binds them to
// the right zone and exposes it, and that the safeTimeZone fallback engages.

describe("companyFormatters", () => {
  const LATE_EVENING_UTC = "2026-09-16T02:39:00.000Z"; // 9:39 PM Sep 15 in America/Chicago

  it("binds every method to the given zone", () => {
    const fmt = companyFormatters("America/Chicago");
    expect(fmt.timeZone).toBe("America/Chicago");
    expect(fmt.date(LATE_EVENING_UTC, { year: "never" })).toBe("Sep 15");
    expect(fmt.time(LATE_EVENING_UTC, { zone: true })).toBe("9:39 PM CDT");
    expect(fmt.dateTime(LATE_EVENING_UTC, { year: "never", zone: true })).toBe("Sep 15, 9:39 PM CDT");
    expect(fmt.longDateTime("2026-09-16T15:00:00.000Z")).toBe("Wednesday, September 16 at 10:00 AM CDT");
  });

  it("falls back to the default company zone for a null/invalid timeZone", () => {
    expect(companyFormatters(null).timeZone).toBe("America/Chicago");
    expect(companyFormatters(undefined).timeZone).toBe("America/Chicago");
    expect(companyFormatters("Not/AZone").timeZone).toBe("America/Chicago");
  });

  it("formats the same instant differently for a different zone", () => {
    const chicago = companyFormatters("America/Chicago");
    const utc = companyFormatters("UTC");
    expect(chicago.date(LATE_EVENING_UTC, { year: "never" })).toBe("Sep 15");
    expect(utc.date(LATE_EVENING_UTC, { year: "never" })).toBe("Sep 16");
  });
});
