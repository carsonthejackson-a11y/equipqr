import { beforeEach, describe, expect, it, vi } from "vitest";

// billing.ts is `import "server-only"`-tagged; vitest runs it under Node,
// not React's "react-server" condition, so the real package would throw.
vi.mock("server-only", () => ({}));

// getEntitlements() only calls `supabase.rpc("get_company_entitlements")`,
// so a bare `{ rpc }` object stands in for the cookie-based server client.
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: (...args: unknown[]) => rpcMock(...args) }),
}));

import { getEntitlements } from "./billing";

/** The raw json row get_company_entitlements() (migration 0024) returns, with overridable keys. */
function row(overrides: Record<string, unknown>) {
  return {
    plan_id: "starter",
    status: "none",
    trial_ends_at: null,
    current_period_end: null,
    equipment_count: 0,
    member_count: 1,
    is_trialing: false,
    is_locked: false,
    company_kind: "service_provider",
    location_count: 0,
    max_locations: null,
    ...overrides,
  };
}

describe("getEntitlements", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("floors a lapsed (canceled, not trialing) owner-kind company to the free plan", async () => {
    // The RPC never locks an equipment_owner, so it hands back the stale paid
    // plan_id; the DB triggers already enforce free's limits for this state.
    rpcMock.mockResolvedValue({
      data: row({
        plan_id: "multi_site",
        status: "canceled",
        is_trialing: false,
        is_locked: false,
        company_kind: "equipment_owner",
        max_locations: 5,
      }),
      error: null,
    });

    const entitlements = await getEntitlements();
    expect(entitlements?.plan_id).toBe("free");
    // The location cap shown on the billing page follows the floored plan too.
    expect(entitlements?.max_locations).toBe(1);
    expect(entitlements?.company_kind).toBe("equipment_owner");
    expect(entitlements?.is_locked).toBe(false);
  });

  it("keeps an active owner-kind subscription on its paid plan", async () => {
    rpcMock.mockResolvedValue({
      data: row({
        plan_id: "multi_site",
        status: "active",
        is_trialing: false,
        is_locked: false,
        company_kind: "equipment_owner",
        max_locations: 5,
      }),
      error: null,
    });

    const entitlements = await getEntitlements();
    expect(entitlements?.plan_id).toBe("multi_site");
  });

  it("keeps a trialing company on the plan the RPC resolved", async () => {
    rpcMock.mockResolvedValue({
      data: row({ plan_id: "site", status: "trialing", is_trialing: true, company_kind: "equipment_owner" }),
      error: null,
    });

    const entitlements = await getEntitlements();
    expect(entitlements?.plan_id).toBe("site");
    expect(entitlements?.is_trialing).toBe(true);
  });

  it("leaves a locked provider (already floored by the RPC) unchanged", async () => {
    rpcMock.mockResolvedValue({
      data: row({ plan_id: "starter", status: "canceled", is_trialing: false, is_locked: true }),
      error: null,
    });

    const entitlements = await getEntitlements();
    expect(entitlements?.plan_id).toBe("starter");
    expect(entitlements?.is_locked).toBe(true);
    expect(entitlements?.status).toBe("canceled");
  });

  it("returns null when the RPC errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await getEntitlements()).toBeNull();
    errorSpy.mockRestore();
  });
});
