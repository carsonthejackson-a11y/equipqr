import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookDelivery } from "@/lib/types";
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMEOUT_MS,
  verifyWebhookSignature,
} from "./webhook-signing";

// webhooks.ts is `import "server-only"`-tagged and imports after() from
// next/server; neither exists outside a Next request scope, so stub both
// (same trick as api-auth.test.ts).
vi.mock("server-only", () => ({}));
const afterMock = vi.fn((cb: () => unknown) => void cb());
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterMock(cb) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("no service role in tests");
  },
}));

const secret = `${WEBHOOK_SECRET_PREFIX}unit_test_secret`;

function delivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: "d1",
    company_id: "c1",
    endpoint_id: "e1",
    event_type: "webhook.test",
    payload: {
      id: "evt_1",
      type: "webhook.test",
      created_at: "2026-09-06T12:00:00Z",
      company_id: "c1",
      data: { message: "hi" },
    },
    status: "pending",
    attempts: 1,
    next_attempt_at: "2026-09-06T12:00:00Z",
    last_attempt_at: null,
    response_status: null,
    last_error: null,
    delivered_at: null,
    created_at: "2026-09-06T12:00:00Z",
    ...overrides,
  };
}

type FetchCall = { url: string; init: RequestInit };

function fakeFetch(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { impl, calls };
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string>)[name];
}

describe("attemptDelivery", () => {
  it("POSTs the payload with event, delivery and a verifiable signature header", async () => {
    const { attemptDelivery } = await import("./webhooks");
    const { impl, calls } = fakeFetch(() => new Response("ok", { status: 200 }));

    const d = delivery();
    const result = await attemptDelivery(d, { url: "https://hooks.example.com/eq", secret }, impl);

    expect(result).toEqual({ ok: true, status: 200, error: null });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe("https://hooks.example.com/eq");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(headerOf(init, "Content-Type")).toBe("application/json");
    expect(headerOf(init, WEBHOOK_EVENT_HEADER)).toBe("webhook.test");
    expect(headerOf(init, WEBHOOK_DELIVERY_HEADER)).toBe("d1");

    const body = init.body as string;
    expect(JSON.parse(body)).toEqual(d.payload);
    const signature = headerOf(init, WEBHOOK_SIGNATURE_HEADER);
    expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature({ secret, header: signature, body })).toBe(true);
    // A different secret or a tampered body must not verify.
    expect(verifyWebhookSignature({ secret: "whsec_other", header: signature, body })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: signature, body: body + "x" })).toBe(false);
  });

  it("treats any 2xx as delivered and a non-2xx as a failure with an HTTP excerpt", async () => {
    const { attemptDelivery } = await import("./webhooks");

    const accepted = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await attemptDelivery(delivery(), { url: "https://x.example/h", secret }, accepted.impl)).toEqual({
      ok: true,
      status: 204,
      error: null,
    });

    const failing = fakeFetch(() => new Response("kaboom " + "x".repeat(500), { status: 500 }));
    const result = await attemptDelivery(delivery(), { url: "https://x.example/h", secret }, failing.impl);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toMatch(/^HTTP 500: kaboom/);
    // Excerpt is bounded (200 chars of body + prefix).
    expect(result.error!.length).toBeLessThanOrEqual("HTTP 500: ".length + 200);

    const redirecting = fakeFetch(() => new Response(null, { status: 302 }));
    const redirect = await attemptDelivery(delivery(), { url: "https://x.example/h", secret }, redirecting.impl);
    expect(redirect).toEqual({ ok: false, status: 302, error: "HTTP 302" });
  });

  it("reports a rejected fetch as a failure with the message and no status", async () => {
    const { attemptDelivery } = await import("./webhooks");
    const rejecting = fakeFetch(() => {
      throw new Error("getaddrinfo ENOTFOUND hooks.example.com");
    });
    expect(await attemptDelivery(delivery(), { url: "https://hooks.example.com/h", secret }, rejecting.impl)).toEqual({
      ok: false,
      status: null,
      error: "getaddrinfo ENOTFOUND hooks.example.com",
    });
  });

  describe("timeout", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("aborts after WEBHOOK_TIMEOUT_MS and says so", async () => {
      const { attemptDelivery } = await import("./webhooks");
      // A fetch that never resolves on its own — only the abort signal ends it.
      const hanging = fakeFetch(
        ({ init }) =>
          new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      );
      const pending = attemptDelivery(delivery(), { url: "https://slow.example/h", secret }, hanging.impl);
      await vi.advanceTimersByTimeAsync(WEBHOOK_TIMEOUT_MS + 1);
      expect(await pending).toEqual({ ok: false, status: null, error: `Timed out after ${WEBHOOK_TIMEOUT_MS / 1000}s` });
    });
  });
});

type EndpointRow = { id: string; url: string; secret: string; is_active: boolean };

function fakeAdmin(deliveries: WebhookDelivery[], endpoints: EndpointRow[]) {
  const rpc = vi.fn<
    (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  >(async (fn, args) => {
    if (fn === "claim_webhook_deliveries") return { data: deliveries, error: null };
    if (fn === "finish_webhook_delivery") return { data: null, error: null };
    if (fn === "release_webhook_deliveries") return { data: (args?.p_ids as string[]).length, error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });
  const inMock = vi.fn(() => ({ returns: async () => ({ data: endpoints, error: null }) }));
  const from = vi.fn(() => ({ select: () => ({ in: inMock }) }));
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, inMock };
}

describe("drainWebhookDeliveries", () => {
  it("claims, looks up endpoints, sends, and finishes each delivery with the right status", async () => {
    const { drainWebhookDeliveries } = await import("./webhooks");
    const rows = [
      delivery({ id: "d-ok", endpoint_id: "e-ok", event_type: "equipment.created" }),
      delivery({ id: "d-bad", endpoint_id: "e-bad", event_type: "service_request.created" }),
      delivery({ id: "d-off", endpoint_id: "e-off" }),
      delivery({ id: "d-gone", endpoint_id: "e-gone" }),
    ];
    const endpoints: EndpointRow[] = [
      { id: "e-ok", url: "https://ok.example/h", secret, is_active: true },
      { id: "e-bad", url: "https://bad.example/h", secret, is_active: true },
      { id: "e-off", url: "https://off.example/h", secret, is_active: false },
    ];
    const admin = fakeAdmin(rows, endpoints);
    const { impl, calls } = fakeFetch(({ url }) =>
      url.startsWith("https://ok.") ? new Response("", { status: 200 }) : new Response("nope", { status: 503 })
    );

    const result = await drainWebhookDeliveries(admin.client, { limit: 10, companyId: "c1", fetchImpl: impl });

    expect(admin.rpc).toHaveBeenCalledWith("claim_webhook_deliveries", { p_limit: 10, p_company_id: "c1" });
    expect(admin.from).toHaveBeenCalledWith("webhook_endpoints");
    expect(admin.inMock).toHaveBeenCalledWith("id", ["e-ok", "e-bad", "e-off", "e-gone"]);

    // Only the two active endpoints were actually contacted. Endpoints run
    // in parallel, so compare as sets.
    expect(calls.map((c) => c.url).sort()).toEqual(["https://bad.example/h", "https://ok.example/h"]);

    const finishes = admin.rpc.mock.calls.filter(([fn]) => fn === "finish_webhook_delivery").map(([, args]) => args);
    expect(finishes).toHaveLength(4);
    expect(finishes).toEqual(
      expect.arrayContaining([
        { p_delivery_id: "d-ok", p_response_status: 200, p_error: null },
        { p_delivery_id: "d-bad", p_response_status: 503, p_error: "HTTP 503: nope" },
        { p_delivery_id: "d-off", p_response_status: null, p_error: "Endpoint is disabled" },
        { p_delivery_id: "d-gone", p_response_status: null, p_error: "Endpoint no longer exists" },
      ])
    );
    // Nothing was left unattempted, so nothing was handed back.
    expect(admin.rpc.mock.calls.some(([fn]) => fn === "release_webhook_deliveries")).toBe(false);

    expect(result.claimed).toBe(4);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(3);
    expect(result.released).toBe(0);
    expect(
      result.outcomes.map((o) => [o.deliveryId, o.ok, o.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    ).toEqual([
      ["d-bad", false, 503],
      ["d-gone", false, null],
      ["d-off", false, null],
      ["d-ok", true, 200],
    ]);
  });

  it("returns zero counts and touches nothing else when there is nothing to claim", async () => {
    const { drainWebhookDeliveries } = await import("./webhooks");
    const admin = fakeAdmin([], []);
    const { impl, calls } = fakeFetch(() => new Response("", { status: 200 }));

    const result = await drainWebhookDeliveries(admin.client, { fetchImpl: impl });

    expect(result).toEqual({ claimed: 0, delivered: 0, failed: 0, released: 0, outcomes: [] });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith("claim_webhook_deliveries", { p_limit: 50, p_company_id: null });
    expect(admin.from).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("never throws when the claim RPC fails", async () => {
    const { drainWebhookDeliveries } = await import("./webhooks");
    const rpc = vi.fn(async () => ({ data: null, error: { message: "permission denied" } }));
    const from = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await drainWebhookDeliveries({ rpc, from } as unknown as SupabaseClient);
    expect(result).toEqual({ claimed: 0, delivered: 0, failed: 0, released: 0, outcomes: [] });
    expect(from).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("drainWebhookDeliveries time budget", () => {
  it("keeps one endpoint's rows in order while endpoints run in parallel", async () => {
    const { drainWebhookDeliveries } = await import("./webhooks");
    const rows = [
      delivery({ id: "a1", endpoint_id: "e-a" }),
      delivery({ id: "b1", endpoint_id: "e-b" }),
      delivery({ id: "a2", endpoint_id: "e-a" }),
      delivery({ id: "a3", endpoint_id: "e-a" }),
    ];
    const endpoints: EndpointRow[] = [
      { id: "e-a", url: "https://a.example/h", secret, is_active: true },
      { id: "e-b", url: "https://b.example/h", secret, is_active: true },
    ];
    const admin = fakeAdmin(rows, endpoints);
    const { impl, calls } = fakeFetch(() => new Response(null, { status: 204 }));

    const result = await drainWebhookDeliveries(admin.client, { limit: 10, fetchImpl: impl, concurrency: 2 });

    const aOrder = calls
      .map((c) => c.init.headers as Record<string, string>)
      .filter((h) => h[WEBHOOK_DELIVERY_HEADER].startsWith("a"))
      .map((h) => h[WEBHOOK_DELIVERY_HEADER]);
    expect(aOrder).toEqual(["a1", "a2", "a3"]);
    expect(result.delivered).toBe(4);
    expect(result.released).toBe(0);
  });

  it("stops at the deadline and hands unattempted rows back with release_webhook_deliveries", async () => {
    const { drainWebhookDeliveries } = await import("./webhooks");
    const rows = [
      delivery({ id: "s1", endpoint_id: "e-slow" }),
      delivery({ id: "s2", endpoint_id: "e-slow" }),
      delivery({ id: "s3", endpoint_id: "e-slow" }),
    ];
    const endpoints: EndpointRow[] = [{ id: "e-slow", url: "https://slow.example/h", secret, is_active: true }];
    const admin = fakeAdmin(rows, endpoints);
    // Each attempt takes ~30ms; the budget allows roughly one.
    const { impl, calls } = fakeFetch(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("", { status: 200 })), 30))
    );

    const result = await drainWebhookDeliveries(admin.client, { limit: 10, fetchImpl: impl, deadlineMs: 25 });

    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThan(3);
    const release = admin.rpc.mock.calls.find(([fn]) => fn === "release_webhook_deliveries");
    expect(release).toBeDefined();
    const releasedIds = (release![1] as { p_ids: string[] }).p_ids;
    expect(releasedIds.length).toBe(3 - calls.length);
    expect(releasedIds).not.toContain("s1");
    expect(result.released).toBe(releasedIds.length);
    expect(result.delivered + result.released).toBe(3);
  });
});

describe("deliverAndReport", () => {
  function fakeAdminForOne(row: WebhookDelivery | null, endpoint: EndpointRow | null) {
    const rpc = vi.fn<
      (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
    >(async (fn) => {
      if (fn === "claim_webhook_delivery") return { data: row ? [row] : [], error: null };
      if (fn === "finish_webhook_delivery") return { data: null, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    });
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: endpoint, error: null }) }) }),
    }));
    return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
  }

  it("leases exactly the requested delivery, sends it, and returns its outcome", async () => {
    const { deliverAndReport } = await import("./webhooks");
    const admin = fakeAdminForOne(delivery({ id: "test-1", endpoint_id: "e1" }), {
      id: "e1",
      url: "https://ok.example/h",
      secret,
      is_active: true,
    });
    const { impl, calls } = fakeFetch(() => new Response("", { status: 201 }));
    const outcome = await deliverAndReport(admin.client, { companyId: "c1", deliveryId: "test-1", fetchImpl: impl });
    expect(admin.rpc).toHaveBeenCalledWith("claim_webhook_delivery", { p_delivery_id: "test-1" });
    expect(calls).toHaveLength(1);
    expect(outcome).toMatchObject({ deliveryId: "test-1", ok: true, status: 201, error: null });
    expect(admin.rpc).toHaveBeenCalledWith("finish_webhook_delivery", {
      p_delivery_id: "test-1",
      p_response_status: 201,
      p_error: null,
    });
  });

  it("returns null when the delivery isn't claimable and never touches the backlog", async () => {
    const { deliverAndReport } = await import("./webhooks");
    const admin = fakeAdminForOne(null, null);
    const { impl, calls } = fakeFetch(() => new Response("", { status: 200 }));
    const outcome = await deliverAndReport(admin.client, { companyId: "c1", deliveryId: "missing", fetchImpl: impl });
    expect(outcome).toBeNull();
    expect(calls).toHaveLength(0);
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc.mock.calls.some(([fn]) => fn === "claim_webhook_deliveries")).toBe(false);
  });

  it("refuses to report on a row that belongs to another company", async () => {
    const { deliverAndReport } = await import("./webhooks");
    const admin = fakeAdminForOne(delivery({ id: "test-2", company_id: "other" }), {
      id: "e1",
      url: "https://ok.example/h",
      secret,
      is_active: true,
    });
    const { impl, calls } = fakeFetch(() => new Response("", { status: 200 }));
    const outcome = await deliverAndReport(admin.client, { companyId: "c1", deliveryId: "test-2", fetchImpl: impl });
    expect(outcome).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("generateWebhookSecret / flushWebhooksSoon", () => {
  it("generates distinct prefixed secrets", async () => {
    const { generateWebhookSecret } = await import("./webhooks");
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(WEBHOOK_SECRET_PREFIX.length + 20);
  });

  it("schedules the drain through after() and survives a missing service-role key", async () => {
    const { flushWebhooksSoon } = await import("./webhooks");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    afterMock.mockClear();
    expect(() => flushWebhooksSoon("c1")).not.toThrow();
    expect(afterMock).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
