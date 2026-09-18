import { describe, expect, it } from "vitest";
import {
  addDaysToDateOnly,
  addMinutesIso,
  dateKeyInTimeZone,
  formatDateOnly,
  formatDuration,
  formatWeekdayLabel,
  formatZonedDateTime,
  formatZonedTime,
  isDateOnOrBefore,
  isSameInstant,
  isValidIsoDate,
  startOfMonth,
  startOfPreviousMonth,
  startOfWeek,
  todayInTimeZone,
  utcIsoToZonedParts,
  weekDates,
  zonedWallTimeToUtcIso,
} from "@/lib/schedule";

describe("zonedWallTimeToUtcIso", () => {
  it("converts a wall-clock time in America/New_York (EST, UTC-5) to UTC", () => {
    // Jan 15 2026, 2:00 PM Eastern (standard time) = 7:00 PM UTC.
    const iso = zonedWallTimeToUtcIso("2026-01-15", "14:00", "America/New_York");
    expect(iso).toBe("2026-01-15T19:00:00.000Z");
  });

  it("accounts for daylight saving (EDT, UTC-4)", () => {
    // Jul 15 2026, 2:00 PM Eastern (daylight time) = 6:00 PM UTC.
    const iso = zonedWallTimeToUtcIso("2026-07-15", "14:00", "America/New_York");
    expect(iso).toBe("2026-07-15T18:00:00.000Z");
  });

  it("round-trips through utcIsoToZonedParts", () => {
    const iso = zonedWallTimeToUtcIso("2026-03-02", "09:30", "America/Chicago");
    expect(utcIsoToZonedParts(iso, "America/Chicago")).toEqual({ date: "2026-03-02", time: "09:30" });
  });

  it("treats UTC as a no-op zone", () => {
    const iso = zonedWallTimeToUtcIso("2026-06-01", "00:00", "UTC");
    expect(iso).toBe("2026-06-01T00:00:00.000Z");
  });

  it("handles a date that rolls to the next UTC day", () => {
    // 11 PM Pacific (PST, UTC-8) on Jan 15 is 7 AM UTC on Jan 16.
    const iso = zonedWallTimeToUtcIso("2026-01-15", "23:00", "America/Los_Angeles");
    expect(iso).toBe("2026-01-16T07:00:00.000Z");
  });
});

describe("dateKeyInTimeZone", () => {
  it("places a late-evening instant on the correct local calendar day", () => {
    // 2026-01-16T07:00:00Z is 2026-01-15 11 PM in Los Angeles.
    expect(dateKeyInTimeZone("2026-01-16T07:00:00.000Z", "America/Los_Angeles")).toBe("2026-01-15");
    // The same instant is already 2026-01-16 in UTC.
    expect(dateKeyInTimeZone("2026-01-16T07:00:00.000Z", "UTC")).toBe("2026-01-16");
  });
});

describe("todayInTimeZone", () => {
  it("reads the calendar date in the target zone, not the caller's", () => {
    const now = new Date("2026-01-01T02:00:00.000Z"); // 6 PM Dec 31 in LA
    expect(todayInTimeZone("America/Los_Angeles", now)).toBe("2025-12-31");
    expect(todayInTimeZone("UTC", now)).toBe("2026-01-01");
  });
});

describe("formatZonedDateTime / formatZonedTime", () => {
  it("renders a readable date and time in the target zone", () => {
    const iso = "2026-01-15T19:00:00.000Z";
    expect(formatZonedDateTime(iso, "America/New_York")).toContain("2:00");
    expect(formatZonedTime(iso, "America/New_York")).toMatch(/2:00\s*PM/);
  });
});

describe("formatDuration", () => {
  it("formats minutes-only durations", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(5)).toBe("5m");
  });

  it("formats hour-only durations", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
  });

  it("formats mixed hour + minute durations", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(135)).toBe("2h 15m");
  });

  it("treats zero/negative/invalid as 0m", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(-10)).toBe("0m");
    expect(formatDuration(Number.NaN)).toBe("0m");
  });
});

describe("formatDateOnly / formatWeekdayLabel", () => {
  it("formats a plain date column without shifting for timezone", () => {
    expect(formatDateOnly("2026-09-06")).toBe("Sep 6, 2026");
  });

  it("formats a weekday label", () => {
    expect(formatWeekdayLabel("2026-09-07")).toBe("Mon, Sep 7");
  });
});

describe("addDaysToDateOnly / isDateOnOrBefore", () => {
  it("adds whole days without a timezone dependency", () => {
    expect(addDaysToDateOnly("2026-01-30", 5)).toBe("2026-02-04");
    expect(addDaysToDateOnly("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("compares calendar dates lexically", () => {
    expect(isDateOnOrBefore("2026-01-01", "2026-01-02")).toBe(true);
    expect(isDateOnOrBefore("2026-01-02", "2026-01-02")).toBe(true);
    expect(isDateOnOrBefore("2026-01-03", "2026-01-02")).toBe(false);
  });
});

describe("startOfWeek / weekDates", () => {
  it("finds the Monday of the week for any day of the week", () => {
    expect(startOfWeek("2026-09-06")).toBe("2026-08-31"); // Sunday -> previous Monday
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07"); // Monday -> itself
    expect(startOfWeek("2026-09-10")).toBe("2026-09-07"); // Thursday -> that week's Monday
  });

  it("lists all 7 dates of the week in order", () => {
    expect(weekDates("2026-09-07")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });
});

describe("addMinutesIso", () => {
  it("adds minutes to a UTC instant", () => {
    expect(addMinutesIso("2026-01-15T19:00:00.000Z", 90)).toBe("2026-01-15T20:30:00.000Z");
  });

  it("rolls over a day boundary", () => {
    expect(addMinutesIso("2026-01-15T23:30:00.000Z", 60)).toBe("2026-01-16T00:30:00.000Z");
  });
});

describe("isValidIsoDate", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(isValidIsoDate("2026-09-20")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // leap day
  });

  it("rejects other shapes", () => {
    expect(isValidIsoDate("9/20/2026")).toBe(false);
    expect(isValidIsoDate("abc")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("2026-9-2")).toBe(false);
  });

  it("rejects a well-shaped string that isn't a real date", () => {
    // V8 turns "2026-13-45" into an Invalid Date and rolls "2026-02-30" over
    // to March 2 — both must fail, not just the first.
    expect(isValidIsoDate("2026-13-45")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
  });
});

describe("startOfMonth / startOfPreviousMonth", () => {
  it("finds the first of the month containing a date", () => {
    expect(startOfMonth("2026-03-31")).toBe("2026-03-01");
    expect(startOfMonth("2026-03-01")).toBe("2026-03-01");
  });

  it("finds the first of the previous month, crossing a year boundary", () => {
    expect(startOfPreviousMonth("2026-01-15")).toBe("2025-12-01");
    expect(startOfPreviousMonth("2026-03-31")).toBe("2026-02-01");
    expect(startOfPreviousMonth("2026-03-01")).toBe("2026-02-01");
  });
});

describe("isSameInstant", () => {
  it("treats two nulls as the same (absent) instant", () => {
    expect(isSameInstant(null, null)).toBe(true);
    expect(isSameInstant(undefined, null)).toBe(true);
  });

  it("treats one null as a change", () => {
    expect(isSameInstant(null, "2026-09-20T14:00:00.000Z")).toBe(false);
    expect(isSameInstant("2026-09-20T14:00:00.000Z", null)).toBe(false);
  });

  it("matches PostgREST's +00:00 rendering against toISOString()'s .000Z", () => {
    // The bug: scheduleVisit compared these as strings, saw a "change" on
    // every save, nulled reminder_sent_at and re-sent the visit reminder.
    expect(isSameInstant("2026-09-20T14:00:00+00:00", "2026-09-20T14:00:00.000Z")).toBe(true);
    expect(isSameInstant("2026-09-20T09:00:00-05:00", "2026-09-20T14:00:00.000Z")).toBe(true);
  });

  it("reports genuinely different instants as different", () => {
    expect(isSameInstant("2026-09-20T14:00:00+00:00", "2026-09-20T15:00:00.000Z")).toBe(false);
  });
});
