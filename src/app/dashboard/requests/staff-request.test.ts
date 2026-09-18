import { describe, expect, it } from "vitest";
import {
  firstStaffRequestIssue,
  parseStaffRequestEquipmentQuery,
  staffRequestSchema,
} from "./staff-request";

const BASE = {
  equipmentId: "eq-1",
  description: "Won't hold pressure",
  contactName: "Dana",
  contactPhone: "2145550123",
};

describe("staffRequestSchema", () => {
  it("accepts a minimal valid submission (phone only, no visit, no email)", () => {
    const result = staffRequestSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("normal");
      expect(result.data.sendStatusEmail).toBe(false);
    }
  });

  it("requires a unit to be picked", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, equipmentId: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstStaffRequestIssue(result.error)).toMatch(/pick a unit/i);
  });

  it("requires a non-empty description", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, description: "   " });
    expect(result.success).toBe(false);
  });

  it("requires at least a phone or an email", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, contactPhone: "", contactEmail: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstStaffRequestIssue(result.error)).toMatch(/phone number or an email/i);
  });

  it("accepts email-only contact with no phone", () => {
    const result = staffRequestSchema.safeParse({
      ...BASE,
      contactPhone: "",
      contactEmail: "dana@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, contactEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("allows staff to pick urgent, unlike the public report form", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, priority: "urgent" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe("urgent");
  });

  it("rejects an invalid priority value", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, priority: "critical" });
    expect(result.success).toBe(false);
  });

  it("requires an email on file to send a status link", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, sendStatusEmail: true, contactEmail: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstStaffRequestIssue(result.error)).toMatch(/email address/i);
  });

  it("accepts sendStatusEmail when an email is present", () => {
    const result = staffRequestSchema.safeParse({
      ...BASE,
      sendStatusEmail: true,
      contactEmail: "dana@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("requires a date when a visit time is set", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, scheduleTime: "14:00" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstStaffRequestIssue(result.error)).toMatch(/pick a date/i);
  });

  it("accepts a full scheduled visit date + time", () => {
    const result = staffRequestSchema.safeParse({
      ...BASE,
      scheduleDate: "2026-09-20",
      scheduleTime: "14:00",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a date with no time (all-day-ish placeholder visit)", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-09-20" });
    expect(result.success).toBe(true);
  });

  // The action feeds scheduleDate/scheduleTime straight into
  // zonedWallTimeToUtcIso(), which does no parsing of its own — anything that
  // isn't a real "YYYY-MM-DD" / "HH:MM" must be rejected HERE, or the action
  // throws RangeError instead of returning { error }.
  it("rejects a US-style visit date", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, scheduleDate: "9/20/2026" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstStaffRequestIssue(result.error)).toMatch(/YYYY-MM-DD/);
  });

  it("rejects a non-date visit date", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, scheduleDate: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects a visit date that has the right shape but isn't a real date", () => {
    expect(staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-13-45" }).success).toBe(false);
    expect(staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-02-30" }).success).toBe(false);
  });

  it("rejects a 12-hour visit time", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-09-20", scheduleTime: "9pm" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstStaffRequestIssue(result.error)).toMatch(/HH:MM/);
  });

  it("rejects an out-of-range visit time", () => {
    expect(staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-09-20", scheduleTime: "24:00" }).success).toBe(false);
    expect(staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-09-20", scheduleTime: "14:60" }).success).toBe(false);
  });

  it("accepts a well-formed visit date and 24-hour time", () => {
    const result = staffRequestSchema.safeParse({ ...BASE, scheduleDate: "2026-09-20", scheduleTime: "21:00" });
    expect(result.success).toBe(true);
  });
});

describe("parseStaffRequestEquipmentQuery", () => {
  it("treats an empty box as no search at all", () => {
    expect(parseStaffRequestEquipmentQuery("")).toEqual({ term: "", shortCode: null });
    expect(parseStaffRequestEquipmentQuery("   ")).toEqual({ term: "", shortCode: null });
  });

  it("keeps a plain name/serial search as the term, with no short-code match", () => {
    const result = parseStaffRequestEquipmentQuery("espresso machine");
    expect(result.term).toBe("espresso machine");
    expect(result.shortCode).toBeNull();
  });

  it("recognises a dashed short code and normalises it for an exact match", () => {
    const result = parseStaffRequestEquipmentQuery("ABCD-2345");
    expect(result.shortCode).toBe("ABCD2345");
  });

  it("recognises a lowercase, undashed short code", () => {
    const result = parseStaffRequestEquipmentQuery("abcd2345");
    expect(result.shortCode).toBe("ABCD2345");
  });

  it("does not treat an ordinary short free-text term as a short code", () => {
    expect(parseStaffRequestEquipmentQuery("ice").shortCode).toBeNull();
    expect(parseStaffRequestEquipmentQuery("front bar unit").shortCode).toBeNull();
  });

  it("trims surrounding whitespace before checking either form", () => {
    const result = parseStaffRequestEquipmentQuery("  ABCD-2345  ");
    expect(result.term).toBe("ABCD-2345");
    expect(result.shortCode).toBe("ABCD2345");
  });
});
