import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// checkSupabase() only needs .from().select().abortSignal() to resolve —
// not a general Supabase mock, just this route's exact call shape. Typed
// widely enough (error: null | { message: string }) that a single test can
// override the resolved value to simulate a query failure.
type FromResult = { select: () => { abortSignal: () => Promise<{ error: null | { message: string } }> } };
const fromMock = vi.fn(
  (): FromResult => ({
    select: () => ({
      abortSignal: async () => ({ error: null }),
    }),
  })
);
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: fromMock }),
}));

const ORIGINAL_ENV = process.env;

function setBaseEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("GET /api/health", () => {
  it("reports ok with no deep block when ?deep isn't set", async () => {
    setBaseEnv();
    const { GET } = await import("./route");

    const res = await GET(new Request("https://app.example.com/api/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({ supabase: "ok" });
    expect(body.deep).toBeUndefined();
  });

  it("401s ?deep=1 with no Authorization header", async () => {
    setBaseEnv();
    process.env.CRON_SECRET = "s3cr3t";
    const { GET } = await import("./route");

    const res = await GET(new Request("https://app.example.com/api/health?deep=1"));
    expect(res.status).toBe(401);
  });

  it("401s ?deep=1 with the wrong bearer token", async () => {
    setBaseEnv();
    process.env.CRON_SECRET = "s3cr3t";
    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://app.example.com/api/health?deep=1", {
        headers: { authorization: "Bearer wrong" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("401s ?deep=1 when CRON_SECRET itself is unset, even with a header", async () => {
    setBaseEnv();
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://app.example.com/api/health?deep=1", {
        headers: { authorization: "Bearer anything" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("200s ?deep=1 with the right bearer token and reports booleans only, never secret values", async () => {
    setBaseEnv();
    process.env.CRON_SECRET = "s3cr3t";
    process.env.RESEND_API_KEY = "re_123";
    process.env.RESEND_FROM_EMAIL = "hello@equipqr.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://equipqr.co";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.SENTRY_DSN;

    const { GET } = await import("./route");

    const res = await GET(
      new Request("https://app.example.com/api/health?deep=1", {
        headers: { authorization: "Bearer s3cr3t" },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deep).toEqual({
      productionReady: true,
      missingInProduction: [],
      appUrlConfigured: true,
      supabaseServiceRole: true,
      resend: true,
      anthropic: false,
      stripe: false,
      sentry: false,
      cronSecret: true,
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("s3cr3t");
    expect(raw).not.toContain("re_123");
    expect(raw).not.toContain("service-role-key");
  });

  it("flags a still-localhost NEXT_PUBLIC_APP_URL as not production-ready", async () => {
    setBaseEnv();
    process.env.CRON_SECRET = "s3cr3t";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://app.example.com/api/health?deep=1", {
        headers: { authorization: "Bearer s3cr3t" },
      })
    );
    const body = await res.json();

    expect(body.deep.appUrlConfigured).toBe(false);
    expect(body.deep.productionReady).toBe(false);
    expect(body.deep.missingInProduction).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("resend is false unless BOTH the API key and from-address are set", async () => {
    setBaseEnv();
    process.env.CRON_SECRET = "s3cr3t";
    process.env.RESEND_API_KEY = "re_123";
    delete process.env.RESEND_FROM_EMAIL;

    const { GET } = await import("./route");
    const res = await GET(
      new Request("https://app.example.com/api/health?deep=1", {
        headers: { authorization: "Bearer s3cr3t" },
      })
    );
    const body = await res.json();

    expect(body.deep.resend).toBe(false);
  });

  it("503s (but still runs) when the Supabase check itself fails", async () => {
    setBaseEnv();
    fromMock.mockReturnValueOnce({
      select: () => ({
        abortSignal: async () => ({ error: { message: "boom" } }),
      }),
    });

    const { GET } = await import("./route");
    const res = await GET(new Request("https://app.example.com/api/health"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks).toEqual({ supabase: "error" });
  });
});
