import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratedMaintenanceRequest } from "@/lib/types";
import type { brandingForEmail } from "@/lib/email/request-status";

vi.mock("server-only", () => ({}));

const rpcMock = vi.fn();
const companiesReturnsMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: rpcMock,
    // Only the one `.from("companies").select().in().returns()` chain the route uses.
    from: () => ({ select: () => ({ in: () => ({ returns: companiesReturnsMock }) }) }),
  }),
}));

const brandingForEmailMock = vi.fn((params: Parameters<typeof brandingForEmail>[0]) => ({
  name: params.company.name,
  color: "#0f172a",
  onColor: "#ffffff",
  logoUrl: null,
  phone: null,
}));
vi.mock("@/lib/email/request-status", () => ({ brandingForEmail: brandingForEmailMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("@/lib/email/company-email", () => ({ sendCompanyEmail: vi.fn(async () => ({ sent: true })) }));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    CRON_SECRET: "s3cr3t",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function generatedRow(overrides: Partial<GeneratedMaintenanceRequest> = {}): GeneratedMaintenanceRequest {
  return {
    request_id: "req-1",
    public_token: "tok-1",
    company_id: "company-1",
    company_name: "Blue Bottle Kitchen",
    company_notification_email: "ops@example.com",
    company_phone: null,
    company_logo_path: "company-1/logo.png",
    company_brand_color: "#ff0000",
    customer_updates_enabled: true,
    notify_customer: true,
    equipment_id: "eq-1",
    equipment_name: "Espresso machine",
    schedule_id: "sched-1",
    schedule_name: "Descale",
    due_on: "2026-09-20",
    contact_name: "Chef",
    contact_email: "chef@example.com",
    ...overrides,
  };
}

function stubRpc(planId: string) {
  rpcMock.mockImplementation(async (name: string) => {
    if (name === "generate_due_maintenance_requests") return { data: [generatedRow()], error: null };
    if (name === "get_company_plan_flags") return { data: { plan_id: planId }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
  companiesReturnsMock.mockResolvedValue({ data: [{ id: "company-1", kind: "equipment_owner" }] });
}

async function run() {
  const { GET } = await import("./route");
  return GET(new Request("https://app.example.com/api/cron/pm-due", { headers: { authorization: "Bearer s3cr3t" } }));
}

describe("GET /api/cron/pm-due — plan id handed to branding (P6)", () => {
  it("passes an owner-kind plan id through, so a Free kitchen's PM email isn't branded by fail-open", async () => {
    stubRpc("free");

    const res = await run();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ generated: 1, customerEmailsSent: 1, staffEmailsSent: 1 });
    expect(brandingForEmailMock).toHaveBeenCalledTimes(1);
    expect(brandingForEmailMock.mock.calls[0][0]).toMatchObject({ planId: "free" });
  });

  it("passes the other owner plans and the provider plans through too", async () => {
    for (const planId of ["site", "multi_site", "starter", "pro", "business"]) {
      vi.resetModules();
      brandingForEmailMock.mockClear();
      stubRpc(planId);

      await run();

      expect(brandingForEmailMock.mock.calls[0][0]).toMatchObject({ planId });
    }
  });

  it("still nulls a plan id it doesn't recognise", async () => {
    stubRpc("enterprise");

    await run();

    expect(brandingForEmailMock.mock.calls[0][0]).toMatchObject({ planId: null });
  });

  it("rejects a request without the cron secret", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("https://app.example.com/api/cron/pm-due"));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
