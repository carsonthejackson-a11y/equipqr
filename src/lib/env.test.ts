import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = process.env;

function setBaseEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("serverEnv", () => {
  it("throws a clear, listed error when a required var is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { serverEnv } = await import("./env");

    let thrown: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      serverEnv.NEXT_PUBLIC_SUPABASE_URL;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(message).toMatch(/\.env\.local\.example/);
  });

  it("resolves required vars and defaults NEXT_PUBLIC_APP_URL when unset", async () => {
    setBaseEnv();
    delete process.env.NEXT_PUBLIC_APP_URL;

    const { serverEnv } = await import("./env");

    expect(serverEnv.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(serverEnv.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("leaves optional integrations undefined instead of throwing", async () => {
    setBaseEnv();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SENTRY_DSN;

    const { serverEnv } = await import("./env");

    expect(serverEnv.ANTHROPIC_API_KEY).toBeUndefined();
    expect(serverEnv.SENTRY_DSN).toBeUndefined();
  });

  it("treats an optional var set to the empty string the same as unset", async () => {
    // .env.local commonly documents an unused optional key as `KEY=` with
    // nothing after it — that reads as "" from process.env, not undefined.
    setBaseEnv();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";

    const { serverEnv } = await import("./env");

    expect(serverEnv.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("caches validation so a later mutation of process.env isn't re-read", async () => {
    setBaseEnv();
    const { serverEnv } = await import("./env");

    expect(serverEnv.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://changed.supabase.co";
    expect(serverEnv.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
  });
});
