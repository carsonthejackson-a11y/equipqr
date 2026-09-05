import { describe, expect, it } from "vitest";
import {
  detectScanSource,
  isOwnedUploadPath,
  priorityFromChoice,
  requestReference,
  serviceRequestSchema,
} from "@/lib/public-request";

const LEGACY_TOKEN = "a1b2c3d4e5f60718293a4b5c"; // 24 hex, pre-0013 instant code
const SHORT_CODE = "ABCD2345";

describe("detectScanSource", () => {
  it("reports a shared link regardless of the token shape", () => {
    expect(detectScanSource(SHORT_CODE, "link")).toBe("link");
    expect(detectScanSource(LEGACY_TOKEN, "link")).toBe("link");
    expect(detectScanSource(SHORT_CODE, ["link"])).toBe("link");
  });

  it("treats a legacy 24-hex token as a plain QR scan", () => {
    expect(detectScanSource(LEGACY_TOKEN)).toBe("qr");
    expect(detectScanSource(LEGACY_TOKEN.toUpperCase())).toBe("qr");
  });

  it("recognises short codes however they were typed", () => {
    expect(detectScanSource(SHORT_CODE)).toBe("short_code");
    expect(detectScanSource("abcd-2345")).toBe("short_code");
    expect(detectScanSource(" ABCD 2345 ")).toBe("short_code");
  });

  it("falls back to qr for anything that isn't 8 characters", () => {
    expect(detectScanSource("nope")).toBe("qr");
    expect(detectScanSource("")).toBe("qr");
    // A batch token normalises to 8 characters, so it counts as a short code —
    // same rule find_qr_code() applies when it resolves the token.
    expect(detectScanSource("AB3D-9F2K")).toBe("short_code");
  });

  it("ignores an unrecognised src parameter", () => {
    expect(detectScanSource(SHORT_CODE, "email")).toBe("short_code");
    expect(detectScanSource(SHORT_CODE, undefined)).toBe("short_code");
  });
});

describe("priorityFromChoice", () => {
  it("maps the friendly answers onto stored priorities", () => {
    expect(priorityFromChoice("not_urgent")).toBe("low");
    expect(priorityFromChoice("soon")).toBe("normal");
    expect(priorityFromChoice("urgent")).toBe("high");
  });

  it("never lets a customer reach the staff-only `urgent` priority", () => {
    const mapped = (["not_urgent", "soon", "urgent"] as const).map(priorityFromChoice);
    expect(mapped).not.toContain("urgent");
  });
});

describe("requestReference", () => {
  it("formats the first eight characters of the public token", () => {
    expect(requestReference("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe("A1B2-C3D4");
  });

  it("pads a short token rather than producing a ragged reference", () => {
    expect(requestReference("abc")).toBe("ABC0-0000");
  });
});

describe("isOwnedUploadPath", () => {
  it("accepts an object under the scanned token's prefix", () => {
    expect(isOwnedUploadPath(`${SHORT_CODE}/uuid-photo.jpg`, SHORT_CODE)).toBe(true);
  });

  it("rejects another sticker's uploads, traversal and absolute paths", () => {
    expect(isOwnedUploadPath("OTHER123/uuid-photo.jpg", SHORT_CODE)).toBe(false);
    expect(isOwnedUploadPath(`${SHORT_CODE}/../OTHER123/x.jpg`, SHORT_CODE)).toBe(false);
    expect(isOwnedUploadPath(`/${SHORT_CODE}/x.jpg`, SHORT_CODE)).toBe(false);
    expect(isOwnedUploadPath(`${SHORT_CODE}/`, SHORT_CODE)).toBe(false);
  });
});

describe("serviceRequestSchema", () => {
  const valid = {
    qrToken: SHORT_CODE,
    description: "  Grinding noise, won't start  ",
    contactName: "  Dana Reed ",
    contactPhone: "555-0100",
  };

  it("accepts a minimal submission and trims it", () => {
    const parsed = serviceRequestSchema.parse(valid);
    expect(parsed.description).toBe("Grinding noise, won't start");
    expect(parsed.contactName).toBe("Dana Reed");
    expect(parsed.priority).toBe("normal");
    expect(parsed.media).toEqual([]);
    expect(parsed.troubleshootingPath).toEqual([]);
  });

  it("requires a phone number or an email", () => {
    const result = serviceRequestSchema.safeParse({ ...valid, contactPhone: "" });
    expect(result.success).toBe(false);

    expect(
      serviceRequestSchema.safeParse({ ...valid, contactPhone: "", contactEmail: "d@example.com" })
        .success
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(serviceRequestSchema.safeParse({ ...valid, contactEmail: "not-an-email" }).success).toBe(
      false
    );
  });

  it("enforces field lengths", () => {
    expect(
      serviceRequestSchema.safeParse({ ...valid, description: "x".repeat(4001) }).success
    ).toBe(false);
    expect(serviceRequestSchema.safeParse({ ...valid, contactName: "x".repeat(121) }).success).toBe(
      false
    );
    expect(serviceRequestSchema.safeParse({ ...valid, contactPhone: "9".repeat(41) }).success).toBe(
      false
    );
    expect(serviceRequestSchema.safeParse({ ...valid, description: "   " }).success).toBe(false);
  });

  it("caps attachments at six and checks their shape", () => {
    const item = { storage_path: `${SHORT_CODE}/a.jpg`, media_type: "image" as const };
    expect(serviceRequestSchema.safeParse({ ...valid, media: Array(6).fill(item) }).success).toBe(
      true
    );
    expect(serviceRequestSchema.safeParse({ ...valid, media: Array(7).fill(item) }).success).toBe(
      false
    );
    expect(
      serviceRequestSchema.safeParse({
        ...valid,
        media: [{ storage_path: `${SHORT_CODE}/a.pdf`, media_type: "document" }],
      }).success
    ).toBe(false);
  });

  it("refuses attachments that don't belong to the scanned token", () => {
    const result = serviceRequestSchema.safeParse({
      ...valid,
      media: [{ storage_path: "SOMEONEELSE/a.jpg", media_type: "image" }],
    });
    expect(result.success).toBe(false);
  });

  it("only accepts the three customer-selectable priorities", () => {
    for (const priority of ["low", "normal", "high"]) {
      expect(serviceRequestSchema.safeParse({ ...valid, priority }).success).toBe(true);
    }
    expect(serviceRequestSchema.safeParse({ ...valid, priority: "urgent" }).success).toBe(false);
  });
});
