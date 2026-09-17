import { describe, expect, it } from "vitest";
import { isRateLimitError } from "@/lib/auth-errors";

describe("isRateLimitError", () => {
  it("treats a 429 status as a rate limit", () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it("treats every other status as not a rate limit, including missing-account-style errors", () => {
    expect(isRateLimitError({ status: 400 })).toBe(false);
    expect(isRateLimitError({ status: 422 })).toBe(false);
    expect(isRateLimitError({ status: 500 })).toBe(false);
  });

  it("treats no error as not a rate limit", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });

  it("treats an error with no status as not a rate limit", () => {
    expect(isRateLimitError({ status: undefined })).toBe(false);
  });
});
