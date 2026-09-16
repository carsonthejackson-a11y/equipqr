import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_MAX_BYTES, decideDownscaleFallback, downscaleToJpeg } from "@/lib/client-image";

describe("decideDownscaleFallback", () => {
  it("falls back to the original when it's under the cap", () => {
    expect(decideDownscaleFallback(1_000_000, FALLBACK_MAX_BYTES)).toEqual({ fallback: true });
  });

  it("falls back right at the cap (inclusive)", () => {
    expect(decideDownscaleFallback(FALLBACK_MAX_BYTES, FALLBACK_MAX_BYTES)).toEqual({ fallback: true });
  });

  it("refuses a file over the cap, with a readable reason", () => {
    const result = decideDownscaleFallback(FALLBACK_MAX_BYTES + 1, FALLBACK_MAX_BYTES);
    expect(result.fallback).toBe(false);
    if (result.fallback) throw new Error("expected fallback: false");
    expect(result.reason).toMatch(/too large/i);
    expect(result.reason).toMatch(/12 MB/);
  });

  it("uses the default 12MB cap when none is passed", () => {
    expect(decideDownscaleFallback(FALLBACK_MAX_BYTES).fallback).toBe(true);
    expect(decideDownscaleFallback(FALLBACK_MAX_BYTES + 1).fallback).toBe(false);
  });
});

// downscaleToJpeg's happy path needs a real canvas/ImageBitmap, which jsdom
// doesn't implement — these tests only cover the failure/fallback branch
// (Q-53), stubbing createImageBitmap to reject the way a corrupt or
// unsupported file would in a real browser.
describe("downscaleToJpeg fallback behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the original file untouched when decoding fails and the file is under the cap", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported image type"))
    );
    const file = { size: 2 * 1024 * 1024 } as unknown as Blob;

    const result = await downscaleToJpeg(file);

    expect(result).toBe(file);
  });

  it("throws a readable, size-aware error when decoding fails and the file is over the cap", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("unsupported image type"))
    );
    const file = { size: FALLBACK_MAX_BYTES + 1 } as unknown as Blob;

    await expect(downscaleToJpeg(file)).rejects.toThrow(/too large/i);
  });
});
