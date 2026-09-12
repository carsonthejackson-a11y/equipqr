import { describe, expect, it } from "vitest";
import {
  detectScanSource,
  isOwnedUploadPath,
  MAX_SYMPTOMS,
  ownerServiceRequestSchema,
  priorityFromChoice,
  requestReference,
  requestUpdateAuthorStorageKey,
  requestUpdateSchema,
  serviceRequestSchema,
  sitePinSchema,
  sitePinStorageKey,
  vendorActionSchema,
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

describe("requestUpdateSchema", () => {
  const valid = {
    token: SHORT_CODE,
    body: "Still leaking this morning, worse now",
    authorName: "Alice",
  };

  it("accepts a minimal update and trims it", () => {
    const parsed = requestUpdateSchema.parse(valid);
    expect(parsed.body).toBe("Still leaking this morning, worse now");
    expect(parsed.authorName).toBe("Alice");
    expect(parsed.contactPhone).toBe("");
    expect(parsed.contactEmail).toBe("");
    expect(parsed.website).toBe("");
  });

  it("requires a name", () => {
    expect(requestUpdateSchema.safeParse({ ...valid, authorName: "" }).success).toBe(false);
    expect(requestUpdateSchema.safeParse({ ...valid, authorName: "   " }).success).toBe(false);
  });

  it("enforces the 2-2000 character message length, mirroring add_customer_request_update()", () => {
    expect(requestUpdateSchema.safeParse({ ...valid, body: "x" }).success).toBe(false);
    expect(requestUpdateSchema.safeParse({ ...valid, body: "xy" }).success).toBe(true);
    expect(requestUpdateSchema.safeParse({ ...valid, body: "x".repeat(2000) }).success).toBe(true);
    expect(requestUpdateSchema.safeParse({ ...valid, body: "x".repeat(2001) }).success).toBe(false);
    expect(requestUpdateSchema.safeParse({ ...valid, body: "  x  " }).success).toBe(false);
  });

  it("rejects a malformed contact email but allows it blank", () => {
    expect(requestUpdateSchema.safeParse({ ...valid, contactEmail: "not-an-email" }).success).toBe(
      false
    );
    expect(requestUpdateSchema.safeParse({ ...valid, contactEmail: "" }).success).toBe(true);
    expect(
      requestUpdateSchema.safeParse({ ...valid, contactEmail: "alice@example.com" }).success
    ).toBe(true);
  });

  it("accepts an honeypot field without requiring it", () => {
    expect(requestUpdateSchema.parse(valid).website).toBe("");
    expect(requestUpdateSchema.safeParse({ ...valid, website: "http://spam.example" }).success).toBe(
      true
    );
  });

  it("caps field lengths", () => {
    expect(requestUpdateSchema.safeParse({ ...valid, authorName: "x".repeat(121) }).success).toBe(
      false
    );
    expect(requestUpdateSchema.safeParse({ ...valid, token: "x".repeat(201) }).success).toBe(false);
    expect(requestUpdateSchema.safeParse({ ...valid, contactPhone: "9".repeat(41) }).success).toBe(
      false
    );
  });
});

describe("requestUpdateAuthorStorageKey", () => {
  it("returns a stable, non-empty key", () => {
    expect(requestUpdateAuthorStorageKey()).toBe(requestUpdateAuthorStorageKey());
    expect(requestUpdateAuthorStorageKey().length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------------
// Owner roadmap (docs/OWNER-ROADMAP-BRIEF.md §3.3 / §6.2)
// ----------------------------------------------------------------------------

describe("ownerServiceRequestSchema", () => {
  const SHORT_CODE = "OWNR2345";
  const valid = {
    qrToken: SHORT_CODE,
    contactName: "Jamie Cook",
    symptoms: ["Not cooling"],
  };

  it("rejects an empty description and empty symptoms together", () => {
    const result = ownerServiceRequestSchema.safeParse({ ...valid, symptoms: [], description: "" });
    expect(result.success).toBe(false);
  });

  it("accepts free text alone with no symptom chips", () => {
    const result = ownerServiceRequestSchema.safeParse({
      ...valid,
      symptoms: [],
      description: "It's making a grinding noise",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a symptom chip alone with no free text", () => {
    const result = ownerServiceRequestSchema.safeParse({ ...valid, description: "" });
    expect(result.success).toBe(true);
  });

  it(`caps symptoms at ${MAX_SYMPTOMS} and each at 120 characters`, () => {
    const tooMany = Array.from({ length: MAX_SYMPTOMS + 1 }, (_, i) => `Symptom ${i}`);
    expect(ownerServiceRequestSchema.safeParse({ ...valid, symptoms: tooMany }).success).toBe(false);
    expect(
      ownerServiceRequestSchema.safeParse({
        ...valid,
        symptoms: Array.from({ length: MAX_SYMPTOMS }, (_, i) => `Symptom ${i}`),
      }).success
    ).toBe(true);

    expect(
      ownerServiceRequestSchema.safeParse({ ...valid, symptoms: ["x".repeat(121)] }).success
    ).toBe(false);
    expect(
      ownerServiceRequestSchema.safeParse({ ...valid, symptoms: ["x".repeat(120)] }).success
    ).toBe(true);
  });

  it("enforces the <qrToken>/ media prefix", () => {
    const goodMedia = [{ storage_path: `${SHORT_CODE}/a.jpg`, media_type: "image" as const }];
    const badMedia = [{ storage_path: "OTHER0000/a.jpg", media_type: "image" as const }];
    expect(ownerServiceRequestSchema.safeParse({ ...valid, media: goodMedia }).success).toBe(true);
    expect(ownerServiceRequestSchema.safeParse({ ...valid, media: badMedia }).success).toBe(false);
  });

  it("accepts an unfilled honeypot and doesn't require it", () => {
    expect(ownerServiceRequestSchema.parse(valid).website).toBe("");
    expect(
      ownerServiceRequestSchema.safeParse({ ...valid, website: "http://spam.example" }).success
    ).toBe(true);
  });

  it("requires a name and rejects the staff-only priority value", () => {
    expect(ownerServiceRequestSchema.safeParse({ ...valid, contactName: "" }).success).toBe(false);
    expect(ownerServiceRequestSchema.safeParse({ ...valid, priority: "urgent" }).success).toBe(false);
    expect(ownerServiceRequestSchema.safeParse({ ...valid, priority: "high" }).success).toBe(true);
  });
});

describe("sitePinSchema", () => {
  it("accepts a plausible code and requires the qr token", () => {
    expect(sitePinSchema.safeParse({ qrToken: "ABCD2345", pin: "4821" }).success).toBe(true);
    expect(sitePinSchema.safeParse({ qrToken: "", pin: "4821" }).success).toBe(false);
    expect(sitePinSchema.safeParse({ qrToken: "ABCD2345", pin: "" }).success).toBe(false);
  });
});

describe("sitePinStorageKey", () => {
  it("is stable per location and distinct across locations", () => {
    expect(sitePinStorageKey("loc-1")).toBe(sitePinStorageKey("loc-1"));
    expect(sitePinStorageKey("loc-1")).not.toBe(sitePinStorageKey("loc-2"));
  });
});

describe("vendorActionSchema", () => {
  it("rejects an unknown action", () => {
    expect(vendorActionSchema.safeParse({ token: "t", action: "close" }).success).toBe(false);
  });

  it("requires an ETA for the eta action", () => {
    expect(vendorActionSchema.safeParse({ token: "t", action: "eta" }).success).toBe(false);
    expect(
      vendorActionSchema.safeParse({ token: "t", action: "eta", etaAt: "2027-01-01T12:00:00Z" }).success
    ).toBe(true);
  });

  it("accepts acknowledge/finish with an optional note", () => {
    expect(vendorActionSchema.safeParse({ token: "t", action: "acknowledge" }).success).toBe(true);
    expect(
      vendorActionSchema.safeParse({ token: "t", action: "finish", note: "All set" }).success
    ).toBe(true);
  });

  it("requires a 2-2000 char body for note and a 2-500 char reason for decline", () => {
    expect(vendorActionSchema.safeParse({ token: "t", action: "note", body: "x" }).success).toBe(false);
    expect(vendorActionSchema.safeParse({ token: "t", action: "note", body: "ok" }).success).toBe(true);
    expect(vendorActionSchema.safeParse({ token: "t", action: "decline" }).success).toBe(false);
    expect(
      vendorActionSchema.safeParse({ token: "t", action: "decline", reason: "Not ours" }).success
    ).toBe(true);
  });
});
