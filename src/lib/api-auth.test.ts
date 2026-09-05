import { describe, expect, it, vi, beforeEach } from "vitest";

// api-auth.ts is `import "server-only"`-tagged; vitest runs it under Node,
// not React's "react-server" condition, so the real package would throw.
vi.mock("server-only", () => ({}));

const rpcMock = vi.fn();
const createAdminClientMock = vi.fn(() => ({ rpc: rpcMock }));
const checkRateLimitMock = vi.fn(async () => true);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { apiKey: { limit: 600, windowSeconds: 60 } },
  checkRateLimit: () => checkRateLimitMock(),
}));

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
    rpcMock.mockReset();
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
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects when the key lacks the required scope", async () => {
    rpcMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read"] }], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }), "write");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects when the per-key rate limit is exceeded", async () => {
    rpcMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read", "write"] }], error: null });
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
    rpcMock.mockResolvedValue({ data: [{ company_id: "co_1", scopes: ["read"] }], error: null });
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
    rpcMock.mockResolvedValue({ data: [{ company_id: "co_2", scopes: ["read", "write"] }], error: null });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_xyz" }), "write");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ctx.scopes).toEqual(["read", "write"]);
  });

  it("filters out unknown scope strings from the resolved row", async () => {
    rpcMock.mockResolvedValue({
      data: [{ company_id: "co_1", scopes: ["read", "admin", "delete-everything"] }],
      error: null,
    });
    const { authenticateApiRequest } = await import("./api-auth");
    const result = await authenticateApiRequest(request({ authorization: "Bearer eqr_live_abc123" }), "read");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ctx.scopes).toEqual(["read"]);
  });
});
