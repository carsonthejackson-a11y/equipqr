import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// The route verifies the raw body against STRIPE_WEBHOOK_SECRET via
// stripe.webhooks.constructEvent(); tests don't need a real signature, so
// the fake just hands back whatever event the test queued.
const constructEventMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ webhooks: { constructEvent: constructEventMock } }),
}));

const createAdminClientMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

type CompanyRow = { id: string; kind: "service_provider" | "equipment_owner" };
type SubscriptionRow = { updated_at: string; stripe_subscription_id: string | null };

/** Purpose-built fake for the exact `.from()` call shapes route.ts uses — not a general Supabase mock. */
function fakeAdmin(opts: { companyById?: Record<string, CompanyRow>; existing?: SubscriptionRow | null }) {
  const upsertCalls: Record<string, unknown>[] = [];
  const companyUpdateCalls: { id: string; patch: Record<string, unknown> }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "companies") {
      return {
        select: () => ({
          eq: (col: string, value: string) => ({
            maybeSingle: async () => {
              if (col === "id") return { data: opts.companyById?.[value] ?? null, error: null };
              // Only used by resolveCompanyId's fallback path, which these
              // tests avoid by always supplying subscription.metadata.company_id.
              return { data: null, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            is: async () => {
              companyUpdateCalls.push({ id, patch });
              return { error: null };
            },
          }),
        }),
      };
    }
    if (table === "subscriptions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.existing ?? null, error: null }),
          }),
        }),
        upsert: (row: Record<string, unknown>) => {
          upsertCalls.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`fakeAdmin: unexpected table ${table}`);
  });

  return { from, upsertCalls, companyUpdateCalls };
}

function subscriptionUpdatedEvent(opts: {
  subscriptionId: string;
  priceId: string;
  companyId: string;
  status?: Stripe.Subscription.Status;
  createdUnix?: number;
}): Stripe.Event {
  const subscription = {
    id: opts.subscriptionId,
    object: "subscription",
    status: opts.status ?? "active",
    customer: "cus_1",
    metadata: { company_id: opts.companyId },
    items: { data: [{ price: { id: opts.priceId }, current_period_end: null }] },
    cancel_at_period_end: false,
    trial_end: null,
  } as unknown as Stripe.Subscription;

  return {
    id: `evt_${opts.subscriptionId}`,
    type: "customer.subscription.updated",
    created: opts.createdUnix ?? Math.floor(Date.now() / 1000),
    data: { object: subscription },
  } as unknown as Stripe.Event;
}

function webhookRequest(): Request {
  return new Request("https://api.equipqr.co/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=fake" },
    body: "raw-body",
  });
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  // service_provider prices
  process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_m";
  process.env.STRIPE_PRICE_STARTER_YEARLY = "price_starter_y";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_y";
  process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_business_m";
  process.env.STRIPE_PRICE_BUSINESS_YEARLY = "price_business_y";
  // equipment_owner prices
  process.env.STRIPE_PRICE_SITE_MONTHLY = "price_site_m";
  process.env.STRIPE_PRICE_SITE_YEARLY = "price_site_y";
  process.env.STRIPE_PRICE_MULTI_SITE_MONTHLY = "price_multisite_m";
  process.env.STRIPE_PRICE_MULTI_SITE_YEARLY = "price_multisite_y";

  constructEventMock.mockReset();
  createAdminClientMock.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("POST /api/stripe/webhook — plan kind guard (C1-39)", () => {
  it("writes plan_id/interval when the price's plan kind matches the company's own kind", async () => {
    const admin = fakeAdmin({
      companyById: { "co-provider": { id: "co-provider", kind: "service_provider" } },
      existing: { updated_at: "2020-01-01T00:00:00Z", stripe_subscription_id: "sub_old" },
    });
    createAdminClientMock.mockReturnValue({ from: admin.from });
    constructEventMock.mockReturnValue(
      subscriptionUpdatedEvent({ subscriptionId: "sub_1", priceId: "price_business_m", companyId: "co-provider" })
    );

    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(admin.upsertCalls).toHaveLength(1);
    expect(admin.upsertCalls[0]).toMatchObject({ plan_id: "business", interval: "month" });
  });

  it("ignores a price for the wrong company kind: logs, leaves plan_id/interval untouched on an existing row, still returns 200", async () => {
    const admin = fakeAdmin({
      // equipment_owner company, but the event carries a service_provider
      // (Business) price — e.g. edited by hand in the Stripe dashboard.
      companyById: { "co-owner": { id: "co-owner", kind: "equipment_owner" } },
      existing: { updated_at: "2020-01-01T00:00:00Z", stripe_subscription_id: "sub_old" },
    });
    createAdminClientMock.mockReturnValue({ from: admin.from });
    constructEventMock.mockReturnValue(
      subscriptionUpdatedEvent({ subscriptionId: "sub_2", priceId: "price_business_m", companyId: "co-owner" })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(admin.upsertCalls).toHaveLength(1);
    const row = admin.upsertCalls[0];
    expect(row).not.toHaveProperty("plan_id");
    expect(row).not.toHaveProperty("interval");
    // The rest of the subscription still syncs — only the mismatched price is ignored.
    expect(row.status).toBe("active");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("co-owner"));
    errorSpy.mockRestore();
  });

  it("falls back to null plan_id/interval for a kind-mismatched price on a brand-new row", async () => {
    const admin = fakeAdmin({
      companyById: { "co-owner": { id: "co-owner", kind: "equipment_owner" } },
      existing: null,
    });
    createAdminClientMock.mockReturnValue({ from: admin.from });
    constructEventMock.mockReturnValue(
      subscriptionUpdatedEvent({ subscriptionId: "sub_3", priceId: "price_pro_m", companyId: "co-owner" })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(admin.upsertCalls[0]).toMatchObject({ plan_id: null, interval: null });
    errorSpy.mockRestore();
  });

  it("matches an owner-kind plan for an owner-kind company", async () => {
    const admin = fakeAdmin({
      companyById: { "co-owner": { id: "co-owner", kind: "equipment_owner" } },
      existing: { updated_at: "2020-01-01T00:00:00Z", stripe_subscription_id: "sub_old" },
    });
    createAdminClientMock.mockReturnValue({ from: admin.from });
    constructEventMock.mockReturnValue(
      subscriptionUpdatedEvent({ subscriptionId: "sub_4", priceId: "price_multisite_m", companyId: "co-owner" })
    );

    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(admin.upsertCalls[0]).toMatchObject({ plan_id: "multi_site", interval: "month" });
  });
});
