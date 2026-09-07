import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("FEATURES.batchQr", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("defaults to true when NEXT_PUBLIC_FEATURE_BATCH_QR is unset", async () => {
    delete process.env.NEXT_PUBLIC_FEATURE_BATCH_QR;

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(true);
  });

  it("defaults to true when NEXT_PUBLIC_FEATURE_BATCH_QR is the empty string", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(true);
  });

  it("is true when NEXT_PUBLIC_FEATURE_BATCH_QR is \"true\"", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "true";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(true);
  });

  it("is true when NEXT_PUBLIC_FEATURE_BATCH_QR is \"1\"", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "1";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(true);
  });

  it("is false when NEXT_PUBLIC_FEATURE_BATCH_QR is \"false\" (the env kill switch still works)", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "false";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(false);
  });

  it("is false when NEXT_PUBLIC_FEATURE_BATCH_QR is \"0\"", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "0";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(false);
  });
});
