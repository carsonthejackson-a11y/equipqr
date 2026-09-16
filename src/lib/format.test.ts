import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatBytes,
  formatCompanyDate,
  formatCompanyDateTime,
  formatCompanyLongDateTime,
  formatCompanyTime,
  safeTimeZone,
  timeZoneShortName,
} from "@/lib/format";

describe("formatBytes", () => {
  it("keeps small sizes in plain bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("steps up a unit at 1024", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(1024 ** 3)).toBe("1 GB");
    expect(formatBytes(1024 ** 4)).toBe("1 TB");
  });

  it("drops the decimal once the number is big enough not to need it", () => {
    expect(formatBytes(1024 * 9.5)).toBe("9.5 KB");
    expect(formatBytes(1024 * 10.4)).toBe("10 KB");
  });

  it("stays on the largest unit rather than inventing one", () => {
    expect(formatBytes(5 * 1024 ** 5)).toBe("5120 TB");
  });

  it("renders unknown sizes as a dash", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("safeTimeZone", () => {
  it("returns a valid IANA zone unchanged", () => {
    expect(safeTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(safeTimeZone("UTC")).toBe("UTC");
  });

  it("falls back to America/Chicago when the zone is missing", () => {
    expect(safeTimeZone(null)).toBe("America/Chicago");
    expect(safeTimeZone(undefined)).toBe("America/Chicago");
    expect(safeTimeZone("")).toBe("America/Chicago");
  });

  it("falls back to America/Chicago for a zone Intl doesn't recognise", () => {
    expect(safeTimeZone("Not/AZone")).toBe("America/Chicago");
    expect(safeTimeZone("bogus")).toBe("America/Chicago");
  });
});

describe("company time formatting", () => {
  // 2026-09-16T02:39:00Z is 9:39 PM on Sep 15 in America/Chicago (CDT,
  // UTC-5) — a late-evening close-out that's already the next calendar day
  // in UTC. Every assertion below that uses this instant would FAIL if a
  // helper formatted through the process's own timezone (or UTC) instead of
  // the explicit `timeZone` argument — e.g. on a UTC CI machine, the date
  // would read "Sep 16" and the hour "9" would be wrong too.
  const LATE_EVENING_UTC = "2026-09-16T02:39:00.000Z";
  // Noon in America/Chicago in January — standard time (CST, UTC-6), unlike
  // the September instant above (daylight time, CDT) — proves the zone
  // abbreviation is resolved per-instant, not hardcoded.
  const WINTER_NOON_UTC = "2026-01-15T18:00:00.000Z";

  describe("formatCompanyDate", () => {
    it("reads the calendar date IN THE COMPANY ZONE, not UTC", () => {
      expect(formatCompanyDate(LATE_EVENING_UTC, "America/Chicago", { year: "never" })).toBe("Sep 15");
      // Sanity check: the same instant is already Sep 16 in UTC — this is
      // exactly the off-by-one this helper exists to avoid (see its JSDoc).
      expect(formatCompanyDate(LATE_EVENING_UTC, "UTC", { year: "never" })).toBe("Sep 16");
    });

    it('year: "auto" omits the year for the current year and includes it for any other', () => {
      const thisYear = new Date().getFullYear();
      // June 15 stays June 15 in every zone within a UTC-instant offset of
      // +/-14h, so this doesn't depend on which zone "today" is read in.
      const thisYearIso = `${thisYear}-06-15T12:00:00.000Z`;
      const lastYearIso = `${thisYear - 1}-06-15T12:00:00.000Z`;
      expect(formatCompanyDate(thisYearIso, "America/Chicago")).toBe("Jun 15");
      expect(formatCompanyDate(lastYearIso, "America/Chicago")).toBe(`Jun 15, ${thisYear - 1}`);
    });

    it('year: "always" and "never" override the auto behaviour', () => {
      const thisYear = new Date().getFullYear();
      expect(formatCompanyDate(`${thisYear}-06-15T12:00:00.000Z`, "America/Chicago", { year: "always" })).toBe(
        `Jun 15, ${thisYear}`
      );
      expect(formatCompanyDate(`${thisYear - 1}-06-15T12:00:00.000Z`, "America/Chicago", { year: "never" })).toBe(
        "Jun 15"
      );
    });
  });

  describe("formatCompanyTime", () => {
    it("formats the wall-clock time in the company zone with no leading zero on the hour", () => {
      expect(formatCompanyTime(LATE_EVENING_UTC, "America/Chicago")).toBe("9:39 PM");
    });

    it("appends the short zone name when zone: true — CDT in summer, CST in winter", () => {
      expect(formatCompanyTime(LATE_EVENING_UTC, "America/Chicago", { zone: true })).toBe("9:39 PM CDT");
      expect(formatCompanyTime(WINTER_NOON_UTC, "America/Chicago", { zone: true })).toBe("12:00 PM CST");
    });
  });

  describe("formatCompanyDateTime", () => {
    it("combines the date and time in the company zone with no seconds", () => {
      expect(formatCompanyDateTime(LATE_EVENING_UTC, "America/Chicago", { year: "never" })).toBe("Sep 15, 9:39 PM");
    });

    it("appends the short zone name when zone: true", () => {
      expect(formatCompanyDateTime(LATE_EVENING_UTC, "America/Chicago", { year: "never", zone: true })).toBe(
        "Sep 15, 9:39 PM CDT"
      );
      expect(formatCompanyDateTime(WINTER_NOON_UTC, "America/Chicago", { year: "never", zone: true })).toBe(
        "Jan 15, 12:00 PM CST"
      );
    });
  });

  describe("formatCompanyLongDateTime", () => {
    it("spells out the weekday and month and always includes the zone", () => {
      // 2026-09-16T15:00:00Z is 10:00 AM on Wednesday Sep 16 in Chicago (CDT).
      expect(formatCompanyLongDateTime("2026-09-16T15:00:00.000Z", "America/Chicago")).toBe(
        "Wednesday, September 16 at 10:00 AM CDT"
      );
    });
  });

  describe("timeZoneShortName", () => {
    it("resolves the abbreviation in effect for that instant", () => {
      expect(timeZoneShortName(LATE_EVENING_UTC, "America/Chicago")).toBe("CDT");
      expect(timeZoneShortName(WINTER_NOON_UTC, "America/Chicago")).toBe("CST");
    });
  });

  describe("independence from the process timezone", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("keeps formatting in the requested company zone even when process.env.TZ points elsewhere", () => {
      vi.stubEnv("TZ", "Asia/Tokyo");
      expect(formatCompanyDate(LATE_EVENING_UTC, "America/Chicago", { year: "never" })).toBe("Sep 15");
      expect(formatCompanyTime(LATE_EVENING_UTC, "America/Chicago", { zone: true })).toBe("9:39 PM CDT");
      expect(formatCompanyDateTime(LATE_EVENING_UTC, "America/Chicago", { year: "never", zone: true })).toBe(
        "Sep 15, 9:39 PM CDT"
      );
    });
  });
});
