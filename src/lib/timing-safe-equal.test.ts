import { describe, expect, it } from "vitest";
import { timingSafeEqualString } from "./timing-safe-equal";

describe("timingSafeEqualString (C1-53/C1-54)", () => {
  it("is true for identical strings", () => {
    expect(timingSafeEqualString("abc123", "abc123")).toBe(true);
  });

  it("is false for different strings of the same length", () => {
    expect(timingSafeEqualString("abc123", "abc124")).toBe(false);
  });

  it("is false for different lengths, without throwing", () => {
    expect(() => timingSafeEqualString("short", "a-lot-longer-string")).not.toThrow();
    expect(timingSafeEqualString("short", "a-lot-longer-string")).toBe(false);
  });

  it("is false when compared against an empty string", () => {
    expect(timingSafeEqualString("secret", "")).toBe(false);
  });

  it("is true for two empty strings", () => {
    expect(timingSafeEqualString("", "")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEqualString("Secret", "secret")).toBe(false);
  });
});

describe("isAuthorizedBearer", () => {
  it("accepts only the exact Bearer secret", async () => {
    const { isAuthorizedBearer } = await import("./timing-safe-equal");
    expect(isAuthorizedBearer("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedBearer("Bearer s3cret ", "s3cret")).toBe(false);
    expect(isAuthorizedBearer("bearer s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedBearer("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedBearer(null, "s3cret")).toBe(false);
  });

  it("never authorizes when no secret is configured", async () => {
    const { isAuthorizedBearer } = await import("./timing-safe-equal");
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
    expect(isAuthorizedBearer("Bearer undefined", undefined)).toBe(false);
  });
});
