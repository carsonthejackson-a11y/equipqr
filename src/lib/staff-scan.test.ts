import { describe, expect, it } from "vitest";
import {
  buildStaffPhotoPath,
  buildStaffSignaturePath,
  clampEtaMinutes,
  formatOnMyWayNote,
  isOwnedStaffMediaPath,
  resolveVisitContact,
  validateCloseOut,
} from "@/lib/staff-scan";

describe("buildStaffPhotoPath / buildStaffSignaturePath", () => {
  it("matches the migration 0019 storage layout", () => {
    expect(buildStaffPhotoPath("company-1", "req-1", "photo-1")).toBe(
      "staff/company-1/req-1/photo-1.jpg"
    );
    expect(buildStaffSignaturePath("company-1", "req-1")).toBe(
      "staff/company-1/req-1/signature.png"
    );
  });

  it("always names the signature the same thing, so re-signing overwrites", () => {
    expect(buildStaffSignaturePath("c", "r")).toBe(buildStaffSignaturePath("c", "r"));
  });
});

describe("isOwnedStaffMediaPath", () => {
  it("accepts what the close-out uploader actually writes", () => {
    expect(isOwnedStaffMediaPath(buildStaffPhotoPath("c1", "r1", "p1"), "c1", "r1")).toBe(true);
    expect(isOwnedStaffMediaPath(buildStaffSignaturePath("c1", "r1"), "c1", "r1")).toBe(true);
  });

  it("rejects another company's or another request's objects", () => {
    expect(isOwnedStaffMediaPath("staff/c2/r1/p1.jpg", "c1", "r1")).toBe(false);
    expect(isOwnedStaffMediaPath("staff/c1/r2/p1.jpg", "c1", "r1")).toBe(false);
    // A customer upload from any scan of any sticker lives at "<qrToken>/…".
    expect(isOwnedStaffMediaPath("0123456789abcdef01234567/a.jpg", "c1", "r1")).toBe(false);
  });

  it("rejects traversal, absolute paths and the bare prefix", () => {
    expect(isOwnedStaffMediaPath("staff/c1/r1/../../c2/r9/p.jpg", "c1", "r1")).toBe(false);
    expect(isOwnedStaffMediaPath("/staff/c1/r1/p.jpg", "c1", "r1")).toBe(false);
    expect(isOwnedStaffMediaPath("staff/c1/r1/", "c1", "r1")).toBe(false);
    expect(isOwnedStaffMediaPath("", "c1", "r1")).toBe(false);
  });
});

describe("clampEtaMinutes", () => {
  it("passes a normal value through", () => {
    expect(clampEtaMinutes(30)).toBe(30);
  });

  it("rounds fractional input", () => {
    expect(clampEtaMinutes(15.6)).toBe(16);
  });

  it("clamps below the minimum up to 1", () => {
    expect(clampEtaMinutes(0)).toBe(1);
    expect(clampEtaMinutes(-5)).toBe(1);
  });

  it("clamps above the maximum down to 240", () => {
    expect(clampEtaMinutes(9000)).toBe(240);
  });

  it("returns null for non-finite input", () => {
    expect(clampEtaMinutes(NaN)).toBeNull();
    expect(clampEtaMinutes(Infinity)).toBeNull();
  });
});

describe("formatOnMyWayNote", () => {
  it("includes the ETA when given one", () => {
    expect(formatOnMyWayNote("Jamie Rivera", 20)).toBe("Jamie is on the way — ETA ~20 min");
  });

  it("omits the ETA when null", () => {
    expect(formatOnMyWayNote("Jamie Rivera", null)).toBe("Jamie is on the way");
  });

  it("uses only the first name", () => {
    expect(formatOnMyWayNote("  Dana   Lee  ", 5)).toBe("Dana is on the way — ETA ~5 min");
  });

  it("falls back to a generic name when the technician has none on file", () => {
    expect(formatOnMyWayNote("", 5)).toBe("Your technician is on the way — ETA ~5 min");
  });
});

describe("validateCloseOut", () => {
  it("requires a summary", () => {
    expect(validateCloseOut({ summary: "  ", sendEmail: false, emailTo: "" })).toMatch(/summary/i);
  });

  it("requires an email address when the toggle is on", () => {
    expect(validateCloseOut({ summary: "Replaced the belt", sendEmail: true, emailTo: "  " })).toMatch(
      /email/i
    );
  });

  it("passes with a summary and no email", () => {
    expect(validateCloseOut({ summary: "Replaced the belt", sendEmail: false, emailTo: "" })).toBeNull();
  });

  it("passes with a summary and an email address", () => {
    expect(
      validateCloseOut({ summary: "Replaced the belt", sendEmail: true, emailTo: "a@b.com" })
    ).toBeNull();
  });
});

describe("resolveVisitContact", () => {
  it("prefers the equipment's own contact", () => {
    expect(
      resolveVisitContact(
        { contact_name: "Site Manager", contact_phone: "555-0100" },
        { name: "Acme Cafe", contact_name: "Billing Dept", contact_email: "billing@acme.test", contact_phone: "555-0200" }
      )
    ).toEqual({ contactName: "Site Manager", contactEmail: "billing@acme.test", contactPhone: "555-0100" });
  });

  it("falls back to the customer's contact, then the customer's name", () => {
    expect(
      resolveVisitContact(
        { contact_name: null, contact_phone: null },
        { name: "Acme Cafe", contact_name: null, contact_email: "billing@acme.test", contact_phone: "555-0200" }
      )
    ).toEqual({ contactName: "Acme Cafe", contactEmail: "billing@acme.test", contactPhone: "555-0200" });
  });

  it("never returns a blank contact name", () => {
    expect(resolveVisitContact({ contact_name: null, contact_phone: null }, null)).toEqual({
      contactName: "Unknown contact",
      contactEmail: null,
      contactPhone: null,
    });
  });
});
