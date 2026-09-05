import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("normalizeQrCode", () => {
  it("inserts the dash for a clean 8-character code", async () => {
    const { normalizeQrCode } = await import("./qr");
    expect(normalizeQrCode("AB3D9F2K")).toBe("AB3D-9F2K");
  });

  it("uppercases and strips spaces/dashes before normalizing", async () => {
    const { normalizeQrCode } = await import("./qr");
    expect(normalizeQrCode("ab3d 9f2k")).toBe("AB3D-9F2K");
    expect(normalizeQrCode("ab3d-9f2k")).toBe("AB3D-9F2K");
    expect(normalizeQrCode(" a-b 3 d 9f-2k ")).toBe("AB3D-9F2K");
  });

  it("strips non-alphanumeric characters", async () => {
    const { normalizeQrCode } = await import("./qr");
    expect(normalizeQrCode("AB#3D!9F2K*")).toBe("AB3D-9F2K");
  });

  it("returns the cleaned string as-is when it isn't 8 characters", async () => {
    const { normalizeQrCode } = await import("./qr");
    expect(normalizeQrCode("AB3D")).toBe("AB3D");
    expect(normalizeQrCode("")).toBe("");
    expect(normalizeQrCode("AB3D9F2K99")).toBe("AB3D9F2K99");
  });
});

describe("getEquipmentPublicUrl", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("builds a public /e/<token> URL from NEXT_PUBLIC_APP_URL", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.equipqr.com";

    const { getEquipmentPublicUrl } = await import("./qr");
    expect(getEquipmentPublicUrl("AB3D-9F2K")).toBe("https://app.equipqr.com/e/AB3D-9F2K");
  });

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.NEXT_PUBLIC_APP_URL;

    const { getEquipmentPublicUrl } = await import("./qr");
    expect(getEquipmentPublicUrl("tok123")).toBe("http://localhost:3000/e/tok123");
  });
});

describe("short codes", () => {
  it("generates 8 chars from the unambiguous alphabet", async () => {
    const { generateShortCode, SHORT_CODE_ALPHABET } = await import("./qr");
    for (let i = 0; i < 50; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(8);
      for (const ch of code) expect(SHORT_CODE_ALPHABET).toContain(ch);
    }
  });

  it("normalizes typed input and formats with a dash", async () => {
    const { normalizeShortCode, formatShortCode } = await import("./qr");
    expect(normalizeShortCode("ab3d-9f2k")).toBe("AB3D9F2K");
    expect(normalizeShortCode(" ab3d 9f2k ")).toBe("AB3D9F2K");
    expect(normalizeShortCode("0123456789abcdef01234567")).toBeNull();
    expect(formatShortCode("AB3D9F2K")).toBe("AB3D-9F2K");
    expect(formatShortCode("0123456789abcdef01234567")).toBe("0123456789abcdef01234567");
  });

  it("renders QR codes at error-correction level H", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { generateQrSvg, QR_ERROR_CORRECTION } = await import("./qr");
    expect(QR_ERROR_CORRECTION).toBe("H");
    const svg = await generateQrSvg("https://app.equipqr.com/e/AB3D9F2K");
    expect(svg).toContain("<svg");
  });
});

describe("qrLookupCandidates", () => {
  it("offers the short code first for a typed code", async () => {
    const { qrLookupCandidates } = await import("./qr");
    expect(qrLookupCandidates("abcd-2345")[0]).toBe("ABCD2345");
    expect(qrLookupCandidates("abcd 2345")).toContain("ABCD2345");
    expect(qrLookupCandidates("ABCD2345")).toContain("ABCD-2345");
  });

  it("pulls the code out of a pasted sticker URL", async () => {
    const { qrLookupCandidates } = await import("./qr");
    expect(qrLookupCandidates("https://equipqr.co/e/ABCD2345")).toContain("ABCD2345");
    expect(qrLookupCandidates("https://equipqr.co/e/ABCD2345?utm=x")).toContain("ABCD2345");
  });

  it("keeps a legacy 24-hex token as a candidate", async () => {
    const { qrLookupCandidates } = await import("./qr");
    const legacy = "0123456789abcdef01234567";
    expect(qrLookupCandidates(legacy)).toContain(legacy);
  });

  it("emits nothing that could break out of a PostgREST filter", async () => {
    const { qrLookupCandidates } = await import("./qr");
    for (const input of [
      "AB,CD(status.eq.active)",
      "abcd2345,token.eq.x",
      "'; drop table qr_codes; --",
      "a".repeat(200),
    ]) {
      for (const candidate of qrLookupCandidates(input)) {
        expect(candidate).toMatch(/^[A-Za-z0-9-]{1,64}$/);
      }
    }
  });

  it("returns nothing for empty input", async () => {
    const { qrLookupCandidates } = await import("./qr");
    expect(qrLookupCandidates("")).toEqual([]);
    expect(qrLookupCandidates("   ")).toEqual([]);
  });
});

describe("qrFileSlug", () => {
  it("slugifies the equipment name and appends the code", async () => {
    const { qrFileSlug } = await import("./qr");
    expect(qrFileSlug("Break room water heater", "ABCD2345")).toBe(
      "break-room-water-heater-abcd2345"
    );
  });

  it("accepts a formatted short code and strips the dash", async () => {
    const { qrFileSlug } = await import("./qr");
    expect(qrFileSlug("Roof unit A", "ABCD-2345")).toBe("roof-unit-a-abcd2345");
  });

  it("produces only characters safe in a Content-Disposition filename", async () => {
    const { qrFileSlug } = await import("./qr");
    const slug = qrFileSlug('Café "A" / B\\C; #2 — 100%', "ABCD2345");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("falls back to 'equipment' when the name has nothing usable", async () => {
    const { qrFileSlug } = await import("./qr");
    expect(qrFileSlug("日本語", "ABCD2345")).toBe("equipment-abcd2345");
    expect(qrFileSlug("", "ABCD2345")).toBe("equipment-abcd2345");
  });

  it("never leaves a trailing dash after truncating a long name", async () => {
    const { qrFileSlug } = await import("./qr");
    const slug = qrFileSlug(`${"a".repeat(59)} tail`, "ABCD2345");
    expect(slug).not.toContain("--");
    expect(slug.endsWith("-abcd2345")).toBe(true);
  });
});

describe("previousCodeState", () => {
  const unitId = "11111111-1111-1111-1111-111111111111";
  const otherUnitId = "22222222-2222-2222-2222-222222222222";

  it("calls a replaced code that still points here 'replaced'", async () => {
    const { previousCodeState } = await import("./qr");
    expect(previousCodeState({ status: "replaced", equipment_id: unitId }, unitId)).toBe("replaced");
  });

  it("calls a retired code 'retired' even though retiring nulls equipment_id", async () => {
    const { previousCodeState } = await import("./qr");
    expect(previousCodeState({ status: "retired", equipment_id: null }, unitId)).toBe("retired");
  });

  it("calls a still-active code that now points elsewhere 'moved'", async () => {
    const { previousCodeState } = await import("./qr");
    expect(previousCodeState({ status: "active", equipment_id: otherUnitId }, unitId)).toBe("moved");
  });

  it("treats a replaced code whose unit link was cleared as replaced, not moved", async () => {
    const { previousCodeState } = await import("./qr");
    expect(previousCodeState({ status: "replaced", equipment_id: null }, unitId)).toBe("replaced");
  });
});
