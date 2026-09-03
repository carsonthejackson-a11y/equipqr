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

  it("defaults to false when NEXT_PUBLIC_FEATURE_BATCH_QR is unset", async () => {
    delete process.env.NEXT_PUBLIC_FEATURE_BATCH_QR;

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(false);
  });

  it("defaults to false when NEXT_PUBLIC_FEATURE_BATCH_QR is the empty string", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(false);
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

  it("is false when NEXT_PUBLIC_FEATURE_BATCH_QR is \"false\"", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "false";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(false);
  });

  it("is false for any other unrecognized value", async () => {
    process.env.NEXT_PUBLIC_FEATURE_BATCH_QR = "yes";

    const { FEATURES } = await import("./features");
    expect(FEATURES.batchQr).toBe(false);
  });
});
