import { describe, expect, it, vi, beforeEach } from "vitest";

// api-auth.ts is `import "server-only"`-tagged; vitest runs it under Node,
// not React's "react-server" condition, so the real package would throw.
vi.mock("server-only", () => ({}));

// Two RPCs go through the same admin client now: resolve_api_key (auth) and
// get_company_plan_flags (the C1-36 use-time entitlement re-check). Kept as
// separate mocks so a test can drive one without accidentally feeding its
// shape to the other — resolve_api_key's `{company_id, scopes}` row and
// get_company_plan_flags' `{plan_id, is_trialing, is_locked}` row look
// nothing alike, and a shared blanket mock previously meant every test
// implicitly (and inertly) fed the wrong shape into the other RPC.
const resolveApiKeyMock = vi.fn();
const planFlagsMock = vi.fn();
const rpcMock = vi.fn((fn: string, args?: Record<string, unknown>) => {
  if (fn === "resolve_api_key") return resolveApiKeyMock(args);
  if (fn === "get_company_plan_flags") return planFlagsMock(args);
  throw new Error(`unexpected rpc in test: ${fn}`);
});
const createAdminClientMock = vi.fn(() => ({ rpc: rpcMock }));
const checkRateLimitMock = vi.fn(async () => true);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { apiKey: { limit: 600, windowSeconds: 60 } },
  checkRateLimit: () => checkRateLimitMock(),
}));

/** A fully-entitled Business-plan company — the default for every test that isn't specifically about the entitlement gate. */
function entitled() {
  return { data: { plan_id: "business", is_trialing: false, is_locked: false }, error: null };
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://api.equipqr.co/api/v1/me", { headers });
}

describe("generateApiKey / hashApiKey", () => {
  it("generates a plaintext key with the eqr_live_ prefix and a matching prefix/hash", async () => {
    const { generateApiKey, hashApiKey, API_KEY_PREFIX } = await import("./api-auth");
    const { plaintext, keyPrefix, keyHash } = generateApiKey();

    expect(plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(plaintext).toHaveLength(API_KEY_PREFIX.length + 40);
    expect(keyPrefix).toBe(plaintext.slice(0, 12));
    expect(keyHash).toBe(hashApiKey(plaintext));
  });

  it("generates distinct keys on each call", async () => {
    const { generateApiKey } = await import("./api-auth");
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
  });

  it("hashApiKey is a deterministic sha256 hex digest", async () => {
    const { hashApiKey } = await import("./api-auth");
    expect(hashApiKey("abc")).toBe(hashApiKey("abc"));
    expect(hashApiKey("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("authenticateApiRequest", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    resolveApiKeyMock.mockReset();
    planFlagsMock.mockReset().mockResolvedValue(entitled());
    createAdminClientMock.mockReset().mockImplementation(() => ({ rpc: rpcMock }));
    checkRateLimitMock.mockReset().mockResolvedValue(true);
  });

  it("rejects a request with no Authorization header", async () => {
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects a key without the eqr_live_ prefix", async () => {
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer sk_totally_wrong" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns 503 when the admin client can't be created (service role not configured)", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set");
    });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("rejects an unknown or revoked key", async () => {
    resolveApiKeyMock.mockResolvedValue({ data: [], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects when the key lacks the required scope", async () => {
    resolveApiKeyMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read"] }], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }), "write");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects when the per-key rate limit is exceeded", async () => {
    resolveApiKeyMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read", "write"] }], error: null });
    checkRateLimitMock.mockResolvedValue(false);
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      expect(result.response.headers.get("Retry-After")).toBe("60");
    }
  });

  it("succeeds and returns a scoped context for a valid read-scoped key", async () => {
    resolveApiKeyMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read"] }], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }), "read");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ctx.companyId).toBe("co_1");
      expect(result.ctx.scopes).toEqual(["read"]);
      expect(result.ctx.admin).toBeDefined();
    }
  });

  it("succeeds for a write-scoped key when write is required", async () => {
    resolveApiKeyMock.mockResolvedValue({ data: [{ company_id: "co_2", scopes: ["read", "write"] }], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_xyz" }), "write");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ctx.scopes).toEqual(["read", "write"]);
  });

  it("filters out unknown scope strings from the resolved row", async () => {
    resolveApiKeyMock.mockResolvedValue({
      data: [{ company_id: "co_1", scopes: ["read", "admin", "delete-everything"] }],
      error: null,
    });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }), "read");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ctx.scopes).toEqual(["read"]);
  });

  describe("entitlement re-check at use time (C1-36)", () => {
    beforeEach(() => {
      resolveApiKeyMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read", "write"] }], error: null });
    });

    it("returns 402 JSON when the company is locked", async () => {
      planFlagsMock.mockResolvedValue({
        data: { plan_id: "business", is_trialing: false, is_locked: true },
        error: null,
      });
      const { authenticateApiRequest } = await import("./api-auth");
      const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(402);
        const body = await result.response.json();
        expect(body.error).toMatch(/plan/i);
      }
    });

    it("returns 402 when the current plan no longer includes exportApi (downgraded since the key was created)", async () => {
      planFlagsMock.mockResolvedValue({
        data: { plan_id: "starter", is_trialing: false, is_locked: false },
        error: null,
      });
      const { authenticateApiRequest } = await import("./api-auth");
      const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(402);
    });

    it("succeeds when the plan includes exportApi and the company isn't locked", async () => {
      planFlagsMock.mockResolvedValue(entitled());
      const { authenticateApiRequest } = await import("./api-auth");
      const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
      expect(result.ok).toBe(true);
    });

    it("fails OPEN (still succeeds) when the plan-flags lookup itself errors", async () => {
      planFlagsMock.mockResolvedValue({ data: null, error: { message: "db hiccup" } });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { authenticateApiRequest } = await import("./api-auth");
      const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
      expect(result.ok).toBe(true);
      errorSpy.mockRestore();
    });

    it("checks entitlement exactly once per request, after resolving the key", async () => {
      const { authenticateApiRequest } = await import("./api-auth");
      await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
      expect(planFlagsMock).toHaveBeenCalledTimes(1);
      expect(planFlagsMock).toHaveBeenCalledWith({ p_company_id: "co_1" });
    });
  });
});
