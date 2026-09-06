import { describe, expect, it } from "vitest";
import {
  formatZonedDate,
  formatZonedDateTime,
  isPastVisit,
  isValidTimeZone,
  isoToZonedInputs,
  timezoneOffsetMinutes,
  zonedDateTimeToIso,
} from "./scheduling";

describe("zonedDateTimeToIso", () => {
  it("converts Chicago wall-clock time to the right instant (CDT, UTC-5)", () => {
    expect(zonedDateTimeToIso("2026-09-08", "14:30", "America/Chicago")).toBe("2026-09-08T19:30:00.000Z");
  });

  it("converts Chicago wall-clock time in winter (CST, UTC-6)", () => {
    expect(zonedDateTimeToIso("2026-01-15", "09:00", "America/Chicago")).toBe("2026-01-15T15:00:00.000Z");
  });

  it("handles a zone east of UTC and a zone without DST", () => {
    expect(zonedDateTimeToIso("2026-06-01", "08:00", "Europe/Berlin")).toBe("2026-06-01T06:00:00.000Z");
    expect(zonedDateTimeToIso("2026-06-01", "08:00", "America/Phoenix")).toBe("2026-06-01T15:00:00.000Z");
  });

  it("round-trips through isoToZonedInputs across the DST boundary", () => {
    for (const [date, time] of [
      ["2026-03-08", "01:30"],
      ["2026-03-08", "03:30"],
      ["2026-11-01", "00:30"],
      ["2026-11-01", "03:00"],
    ] as const) {
      const iso = zonedDateTimeToIso(date, time, "America/New_York");
      expect(iso).not.toBeNull();
      expect(isoToZonedInputs(iso!, "America/New_York")).toEqual({ date, time });
    }
  });

  it("rejects malformed input and unknown zones", () => {
    expect(zonedDateTimeToIso("2026-9-8", "14:30", "America/Chicago")).toBeNull();
    expect(zonedDateTimeToIso("2026-09-08", "2pm", "America/Chicago")).toBeNull();
    expect(zonedDateTimeToIso("2026-13-08", "14:30", "America/Chicago")).toBeNull();
    expect(zonedDateTimeToIso("2026-02-30", "14:30", "America/Chicago")).toBeNull();
    expect(zonedDateTimeToIso("2026-09-08", "14:30", "Mars/Olympus_Mons")).toBeNull();
  });
});

describe("timezoneOffsetMinutes", () => {
  it("reports the offset in effect at the instant", () => {
    expect(timezoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "America/Chicago")).toBe(-300);
    expect(timezoneOffsetMinutes(new Date("2026-01-01T12:00:00Z"), "America/Chicago")).toBe(-360);
    expect(timezoneOffsetMinutes(new Date("2026-01-01T12:00:00Z"), "UTC")).toBe(0);
    expect(timezoneOffsetMinutes(new Date("2026-01-01T12:00:00Z"), "Asia/Kolkata")).toBe(330);
  });
});

describe("formatting", () => {
  it("formats in the company zone, not the server zone", () => {
    const text = formatZonedDateTime("2026-09-08T19:30:00.000Z", "America/Chicago");
    expect(text).toContain("Sep 8");
    expect(text).toContain("2:30");
    expect(text).toMatch(/PM/);
    expect(text).toMatch(/CDT|GMT-5/);
  });

  it("falls back to UTC on a bad zone rather than throwing", () => {
    expect(formatZonedDateTime("2026-09-08T19:30:00.000Z", "Nowhere/Land")).toContain("7:30");
    expect(formatZonedDate("2026-09-08T19:30:00.000Z", "Nowhere/Land")).toContain("Sep 8");
  });

  it("returns an empty string for an unparseable instant", () => {
    expect(formatZonedDateTime("not a date", "America/Chicago")).toBe("");
    expect(isoToZonedInputs("not a date", "America/Chicago")).toBeNull();
  });
});

describe("misc", () => {
  it("isValidTimeZone", () => {
    expect(isValidTimeZone("America/Denver")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("isPastVisit", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    expect(isPastVisit("2026-09-05T12:00:00Z", now)).toBe(true);
    expect(isPastVisit("2026-09-07T12:00:00Z", now)).toBe(false);
    expect(isPastVisit("garbage", now)).toBe(false);
  });
});
