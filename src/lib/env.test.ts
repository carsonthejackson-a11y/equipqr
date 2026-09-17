import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// checkProductionEnv() dynamic-imports @sentry/nextjs only when SENTRY_DSN
// is set (see env.ts) — mocked so those tests never need a real Sentry init.
const captureMessageMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}));

const ORIGINAL_ENV = process.env;

function setBaseEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
}

/** The 5 C1-53/C1-54 production vars, all present — the "nothing missing" baseline. */
function setProductionReadyEnv() {
  process.env.NEXT_PUBLIC_APP_URL = "https://equipqr.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  process.env.RESEND_API_KEY = "x";
  process.env.RESEND_FROM_EMAIL = "x";
  process.env.CRON_SECRET = "x";
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  captureMessageMock.mockClear();
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

describe("missingProductionEnvVars (C1-53/C1-54)", () => {
  it("is empty when every production var is set", async () => {
    setProductionReadyEnv();
    const { missingProductionEnvVars } = await import("./env");
    expect(missingProductionEnvVars()).toEqual([]);
  });

  it("lists exactly what's missing", async () => {
    setProductionReadyEnv();
    delete process.env.CRON_SECRET;
    delete process.env.RESEND_FROM_EMAIL;
    const { missingProductionEnvVars } = await import("./env");
    expect(missingProductionEnvVars().sort()).toEqual(["CRON_SECRET", "RESEND_FROM_EMAIL"]);
  });

  it("treats a still-localhost NEXT_PUBLIC_APP_URL as missing, not just an unset one", async () => {
    setProductionReadyEnv();

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const fresh1 = await import("./env");
    expect(fresh1.missingProductionEnvVars()).toEqual(["NEXT_PUBLIC_APP_URL"]);

    vi.resetModules();
    delete process.env.NEXT_PUBLIC_APP_URL;
    const fresh2 = await import("./env");
    expect(fresh2.missingProductionEnvVars()).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });
});

describe("checkProductionEnv (C1-53/C1-54)", () => {
  it("does nothing outside production, even with everything missing", async () => {
    delete process.env.VERCEL_ENV;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkProductionEnv } = await import("./env");

    await expect(checkProductionEnv()).resolves.toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does nothing in production when everything required is set", async () => {
    process.env.VERCEL_ENV = "production";
    setProductionReadyEnv();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkProductionEnv } = await import("./env");

    await checkProductionEnv();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs one structured error naming every missing var, but never throws", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkProductionEnv } = await import("./env");

    await expect(checkProductionEnv()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe("env_guard_failure");
    expect(logged.missing).toEqual(
      expect.arrayContaining(["NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"])
    );
    errorSpy.mockRestore();
  });

  it("does not throw even when a legacy ENV_GUARD_ENFORCE=true is still set", async () => {
    process.env.VERCEL_ENV = "production";
    setProductionReadyEnv();
    delete process.env.CRON_SECRET;
    process.env.ENV_GUARD_ENFORCE = "true";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkProductionEnv } = await import("./env");

    await expect(checkProductionEnv()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    delete process.env.ENV_GUARD_ENFORCE;
  });

  it("reports to Sentry when SENTRY_DSN is set", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.SENTRY_DSN = "https://key@sentry.io/1";
    setProductionReadyEnv();
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkProductionEnv } = await import("./env");

    await checkProductionEnv();

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][0]).toContain("CRON_SECRET");
    errorSpy.mockRestore();
  });

  it("skips Sentry entirely when SENTRY_DSN is unset", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.SENTRY_DSN;
    setProductionReadyEnv();
    delete process.env.CRON_SECRET;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkProductionEnv } = await import("./env");

    await checkProductionEnv();

    expect(captureMessageMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
