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
