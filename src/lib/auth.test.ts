import { beforeEach, describe, expect, it, vi } from "vitest";

// The mocked supabase server client pulls in server-only modules elsewhere in
// the tree; keep the same guard every other server-module test uses.
vi.mock("server-only", () => ({}));

/** `redirect()` throws in Next (NEXT_REDIRECT) — model that so a redirect ends the call the same way. */
class RedirectSentinel extends Error {
  constructor(public readonly path: string) {
    super(`NEXT_REDIRECT ${path}`);
  }
}

const redirectMock = vi.fn((path: string): never => {
  throw new RedirectSentinel(path);
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const getUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => maybeSingleMock(table),
        }),
      }),
    }),
    rpc: (fn: string, args?: Record<string, unknown>) => rpcMock(fn, args),
  }),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

const company = { id: COMPANY_ID, name: "Acme Repair", kind: "service_provider" };

function signedInUser(user_metadata: Record<string, string>) {
  return { data: { user: { id: USER_ID, user_metadata } }, error: null };
}

/** profiles → no row (fresh sign-up); companies → the row the RPC just created. */
function noProfileYet() {
  maybeSingleMock.mockImplementation(async (table: string) => {
    if (table === "profiles") return { data: null, error: null };
    if (table === "companies") return { data: company, error: null };
    throw new Error(`unexpected table in test: ${table}`);
  });
}

async function redirectedTo(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RedirectSentinel) return err.path;
    throw err;
  }
  throw new Error("expected a redirect");
}

describe("getCurrentProfile", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserMock.mockReset();
    maybeSingleMock.mockReset();
    rpcMock.mockReset();
  });

  it("returns a synthesised owner profile (via the idempotent RPC) when the profile row is missing but the sign-up metadata is present — the layout/page parallel-render race", async () => {
    getUserMock.mockResolvedValue(
      signedInUser({
        pending_company_name: "Acme Repair",
        pending_notification_email: "ops@acme.example",
        pending_full_name: "Dana Owner",
        pending_company_kind: "equipment_owner",
      })
    );
    noProfileYet();
    rpcMock.mockResolvedValue({ data: COMPANY_ID, error: null });

    const { getCurrentProfile } = await import("./auth");
    const result = await getCurrentProfile();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    // Exactly the layout's call — argument names and the kind whitelist.
    expect(rpcMock).toHaveBeenCalledWith("create_company_and_profile", {
      p_company_name: "Acme Repair",
      p_notification_email: "ops@acme.example",
      p_full_name: "Dana Owner",
      p_kind: "equipment_owner",
    });
    expect(result.profile).toMatchObject({
      id: USER_ID,
      company_id: COMPANY_ID,
      full_name: "Dana Owner",
      role: "owner",
    });
    expect(typeof result.profile.created_at).toBe("string");
    expect(result.company).toEqual(company);
  });

  it("never trusts pending_company_kind beyond the two literals (anything else → service_provider) and defaults the name", async () => {
    getUserMock.mockResolvedValue(
      signedInUser({
        pending_company_name: "Acme Repair",
        pending_notification_email: "ops@acme.example",
        pending_company_kind: "platform_admin",
      })
    );
    noProfileYet();
    rpcMock.mockResolvedValue({ data: COMPANY_ID, error: null });

    const { getCurrentProfile } = await import("./auth");
    const result = await getCurrentProfile();

    expect(rpcMock).toHaveBeenCalledWith("create_company_and_profile", {
      p_company_name: "Acme Repair",
      p_notification_email: "ops@acme.example",
      p_full_name: "",
      p_kind: "service_provider",
    });
    expect(result.profile.full_name).toBeNull();
  });

  it("still redirects to /onboarding when there is no profile and no sign-up metadata", async () => {
    getUserMock.mockResolvedValue(signedInUser({}));
    noProfileYet();

    const { getCurrentProfile } = await import("./auth");
    expect(await redirectedTo(getCurrentProfile())).toBe("/onboarding");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("redirects to the invite when pending_invite_token is set, without creating a company", async () => {
    getUserMock.mockResolvedValue(
      signedInUser({
        pending_invite_token: "tok_abc123",
        // Even with company metadata alongside, the invite wins (same as the layout).
        pending_company_name: "Acme Repair",
        pending_notification_email: "ops@acme.example",
      })
    );
    noProfileYet();

    const { getCurrentProfile } = await import("./auth");
    expect(await redirectedTo(getCurrentProfile())).toBe("/invite/tok_abc123");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("falls back to /onboarding when the RPC fails", async () => {
    getUserMock.mockResolvedValue(
      signedInUser({
        pending_company_name: "Acme Repair",
        pending_notification_email: "ops@acme.example",
      })
    );
    noProfileYet();
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const { getCurrentProfile } = await import("./auth");
    expect(await redirectedTo(getCurrentProfile())).toBe("/onboarding");
  });

  it("leaves the normal path alone: an existing profile is returned without touching the RPC", async () => {
    getUserMock.mockResolvedValue(signedInUser({}));
    const profile = {
      id: USER_ID,
      company_id: COMPANY_ID,
      full_name: "Tech",
      role: "technician",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    maybeSingleMock.mockImplementation(async (table: string) => {
      if (table === "profiles") return { data: profile, error: null };
      if (table === "companies") return { data: company, error: null };
      throw new Error(`unexpected table in test: ${table}`);
    });

    const { getCurrentProfile } = await import("./auth");
    const result = await getCurrentProfile();

    expect(result).toEqual({ profile, company });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when signed out", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const { getCurrentProfile } = await import("./auth");
    expect(await redirectedTo(getCurrentProfile())).toBe("/login");
  });
});
