import { describe, expect, it } from "vitest";
import {
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_ORDER,
  isVendorActionable,
  dispatchSummary,
} from "./dispatch";
import type { DispatchStatus } from "./types";

const ALL_STATUSES: DispatchStatus[] = [
  "pending_approval",
  "sent",
  "viewed",
  "acknowledged",
  "eta_given",
  "finished",
  "declined",
  "failed",
];

describe("DISPATCH_STATUS_LABELS", () => {
  it("covers every DispatchStatus enum value with a non-empty label", () => {
    for (const status of ALL_STATUSES) {
      expect(DISPATCH_STATUS_LABELS[status]).toBeDefined();
      expect(DISPATCH_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("has no extra keys beyond the enum", () => {
    expect(Object.keys(DISPATCH_STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe("DISPATCH_STATUS_ORDER", () => {
  it("contains every status exactly once", () => {
    expect([...DISPATCH_STATUS_ORDER].sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe("isVendorActionable", () => {
  it("is false for finished", () => {
    expect(isVendorActionable("finished")).toBe(false);
  });

  it("is false for declined", () => {
    expect(isVendorActionable("declined")).toBe(false);
  });

  it("is true for every other status", () => {
    for (const status of ALL_STATUSES) {
      if (status === "finished" || status === "declined") continue;
      expect(isVendorActionable(status)).toBe(true);
    }
  });
});

describe("dispatchSummary", () => {
  it("renders the ETA in the given timezone when eta_given and etaAt are set", () => {
    const summary = dispatchSummary({
      status: "eta_given",
      vendorName: "Metro Refrigeration",
      etaAt: "2026-03-17T20:15:00.000Z", // a Tuesday
      timeZone: "America/Chicago",
    });
    expect(summary).toContain("Metro Refrigeration");
    expect(summary).toContain("ETA");
    expect(summary).toContain("Tue");
    expect(summary).toContain("3:15");
  });

  it("omits the formatted ETA date/time and falls back to the plain status label when etaAt is null", () => {
    const summary = dispatchSummary({
      status: "eta_given",
      vendorName: "Metro Refrigeration",
      etaAt: null,
      timeZone: "America/Chicago",
    });
    // No day-of-week / time rendered — just the generic "ETA given" label.
    expect(summary).not.toMatch(/\d/);
    expect(summary).toBe(`Metro Refrigeration · ${DISPATCH_STATUS_LABELS.eta_given}`);
  });

  it("uses a 'No vendor' fallback when vendorName is null", () => {
    const summary = dispatchSummary({ status: "sent", vendorName: null, etaAt: null, timeZone: null });
    expect(summary).toBe(`No vendor · ${DISPATCH_STATUS_LABELS.sent}`);
  });
});
