import { describe, expect, it } from "vitest";
import { defaultVisitInputs, timezoneLabel } from "./visit-defaults";

describe("defaultVisitInputs", () => {
  it("picks tomorrow at 09:00 mid-week", () => {
    // Tuesday 2026-09-08 in Chicago.
    const now = new Date("2026-09-08T19:30:00Z");
    expect(defaultVisitInputs("America/Chicago", now)).toEqual({ date: "2026-09-09", time: "09:00" });
  });

  it("skips the weekend", () => {
    // Friday 2026-09-11 → Monday 2026-09-14.
    expect(defaultVisitInputs("America/Chicago", new Date("2026-09-11T15:00:00Z")).date).toBe("2026-09-14");
    // Saturday → Monday.
    expect(defaultVisitInputs("America/Chicago", new Date("2026-09-12T15:00:00Z")).date).toBe("2026-09-14");
    // Sunday → Monday.
    expect(defaultVisitInputs("America/Chicago", new Date("2026-09-13T15:00:00Z")).date).toBe("2026-09-14");
  });

  it("uses the company zone's 'today', not the server's", () => {
    // 03:00Z on Wed Sep 9 is still Tue Sep 8 in Chicago → default Wed Sep 9.
    expect(defaultVisitInputs("America/Chicago", new Date("2026-09-09T03:00:00Z")).date).toBe("2026-09-09");
    // ...but already Wed in Berlin → default Thu Sep 10.
    expect(defaultVisitInputs("Europe/Berlin", new Date("2026-09-09T03:00:00Z")).date).toBe("2026-09-10");
  });

  it("falls back to UTC on an unknown zone rather than throwing", () => {
    expect(defaultVisitInputs("Nowhere/Land", new Date("2026-09-08T12:00:00Z")).date).toBe("2026-09-09");
  });
});

describe("timezoneLabel", () => {
  it("derives a friendly label from the IANA id", () => {
    expect(timezoneLabel("America/Chicago", new Date("2026-09-08T12:00:00Z"))).toBe("Central Time (Chicago)");
    expect(timezoneLabel("America/Chicago", new Date("2026-01-08T12:00:00Z"))).toBe("Central Time (Chicago)");
    expect(timezoneLabel("America/New_York", new Date("2026-09-08T12:00:00Z"))).toBe("Eastern Time (New York)");
  });

  it("falls back to the cleaned IANA id when there is no long name", () => {
    expect(timezoneLabel("Nowhere/Some_Place")).toBe("Nowhere/Some Place");
    expect(timezoneLabel("Etc/GMT+5")).toBe("Etc/GMT+5");
  });
});
