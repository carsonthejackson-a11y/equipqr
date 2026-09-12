import { afterEach, describe, expect, it } from "vitest";
import {
  allPlans,
  canAddLocation,
  getPlan,
  getStripePriceId,
  isPlanId,
  listStripePriceEnvVars,
  ownerPlans,
  plans,
  plansFor,
  planFromStripePriceId,
  type PlanId,
} from "./plans";

const ALL_PLAN_IDS: PlanId[] = ["starter", "pro", "business", "free", "site", "multi_site"];

const PRICE_ENV_VARS = [
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_BUSINESS_MONTHLY",
  "STRIPE_PRICE_BUSINESS_YEARLY",
  "STRIPE_PRICE_SITE_MONTHLY",
  "STRIPE_PRICE_SITE_YEARLY",
  "STRIPE_PRICE_MULTI_SITE_MONTHLY",
  "STRIPE_PRICE_MULTI_SITE_YEARLY",
];

afterEach(() => {
  for (const envVar of PRICE_ENV_VARS) {
    delete process.env[envVar];
  }
});

describe("plans", () => {
  it("still has exactly the 3 provider ids, all service_provider", () => {
    expect(plans.map((p) => p.id).sort()).toEqual(["business", "pro", "starter"]);
    for (const plan of plans) {
      expect(plan.kind).toBe("service_provider");
    }
  });

  it("ownerPlans has exactly the 3 owner ids, all equipment_owner", () => {
    expect(ownerPlans.map((p) => p.id).sort()).toEqual(["free", "multi_site", "site"]);
    for (const plan of ownerPlans) {
      expect(plan.kind).toBe("equipment_owner");
    }
  });
});

describe("plansFor", () => {
  it("splits provider vs owner plans correctly", () => {
    expect(plansFor("service_provider")).toBe(plans);
    expect(plansFor("equipment_owner")).toBe(ownerPlans);
  });
});

describe("getPlan", () => {
  it("resolves all 6 plan ids", () => {
    for (const id of ALL_PLAN_IDS) {
      expect(getPlan(id).id).toBe(id);
    }
  });

  it("throws for an unknown id", () => {
    expect(() => getPlan("nonsense" as PlanId)).toThrow();
  });
});

describe("isPlanId", () => {
  it("accepts all 6 plan ids and rejects everything else", () => {
    for (const id of ALL_PLAN_IDS) {
      expect(isPlanId(id)).toBe(true);
    }
    expect(isPlanId("nonsense")).toBe(false);
    expect(isPlanId(null)).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
  });
});

describe("canAddLocation", () => {
  it("is true under the limit, false at and over it", () => {
    const site = getPlan("site"); // locationLimit: 1
    expect(canAddLocation(site, 0)).toBe(true);
    expect(canAddLocation(site, 1)).toBe(false);
    expect(canAddLocation(site, 2)).toBe(false);
  });

  it("is always true when locationLimit is null (every provider plan)", () => {
    const pro = getPlan("pro");
    expect(pro.locationLimit).toBeNull();
    expect(canAddLocation(pro, 1_000_000)).toBe(true);
  });

  it("multi_site allows up to 5 locations", () => {
    const multiSite = getPlan("multi_site");
    expect(canAddLocation(multiSite, 4)).toBe(true);
    expect(canAddLocation(multiSite, 5)).toBe(false);
  });
});

describe("getStripePriceId", () => {
  it("throws a clear error for the free plan — it needs no checkout", () => {
    expect(() => getStripePriceId("free", "month")).toThrow(/no stripe price/i);
  });

  it("throws when the matching env var is unset", () => {
    expect(() => getStripePriceId("site", "month")).toThrow(/STRIPE_PRICE_SITE_MONTHLY/);
  });

  it("returns the configured price id for every non-free plan/interval", () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_month";
    process.env.STRIPE_PRICE_MULTI_SITE_YEARLY = "price_multi_site_year";

    expect(getStripePriceId("starter", "month")).toBe("price_starter_month");
    expect(getStripePriceId("multi_site", "year")).toBe("price_multi_site_year");
  });
});

describe("listStripePriceEnvVars", () => {
  it("has 10 unique names and never includes a free entry", () => {
    const envVars = listStripePriceEnvVars();
    expect(envVars).toHaveLength(10);
    expect(new Set(envVars).size).toBe(10);
    expect(envVars.some((v) => v.toLowerCase().includes("free"))).toBe(false);
  });
});

describe("planFromStripePriceId", () => {
  it("round-trips every non-free plan/interval once its env var is set", () => {
    for (const plan of allPlans) {
      if (plan.id === "free") continue;
      for (const interval of ["month", "year"] as const) {
        const priceId = `price_${plan.id}_${interval}`;
        const envVar = listEnvVarFor(plan.id, interval);
        process.env[envVar] = priceId;

        expect(planFromStripePriceId(priceId)).toEqual({ planId: plan.id, interval });

        delete process.env[envVar];
      }
    }
  });

  it("returns null for an unrecognized price id", () => {
    expect(planFromStripePriceId("price_does_not_exist")).toBeNull();
  });

  it("returns null when nothing is configured", () => {
    expect(planFromStripePriceId("price_site_month")).toBeNull();
  });
});

function listEnvVarFor(planId: Exclude<PlanId, "free">, interval: "month" | "year"): string {
  const suffix = interval === "month" ? "MONTHLY" : "YEARLY";
  return `STRIPE_PRICE_${planId.toUpperCase()}_${suffix}`;
}
