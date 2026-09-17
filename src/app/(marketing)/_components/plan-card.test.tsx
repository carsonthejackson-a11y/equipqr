import { describe, expect, it } from "vitest";
import { ownerPlans, plans } from "@/lib/plans";
import { formatPrice, planLimitsLine } from "./plan-card";

// C1-35: every owner trial resolves to Kitchen-level entitlements
// (TRIAL_PLAN_BY_KIND.equipment_owner = "site" in src/lib/plans.ts,
// mirrored in supabase/migrations/0024_owner_foundation.sql's entitlement
// RPCs) regardless of which plan card was clicked. Only the Kitchen card
// itself may promise "14-day free trial" — Free doesn't trial at all, and
// Multi-kitchen must not claim a trial at its own tier.
describe("planLimitsLine", () => {
  it("says 'Unlimited staff' for Free, never a trial", () => {
    const free = ownerPlans.find((p) => p.id === "free")!;
    expect(planLimitsLine(free)).toContain("Unlimited staff");
    expect(planLimitsLine(free)).not.toContain("trial");
  });

  it("promises a 14-day free trial for Kitchen (the plan the trial actually grants)", () => {
    const kitchen = ownerPlans.find((p) => p.id === "site")!;
    expect(planLimitsLine(kitchen)).toContain("14-day free trial");
  });

  it("does not promise Multi-kitchen its own trial", () => {
    const multiKitchen = ownerPlans.find((p) => p.id === "multi_site")!;
    const line = planLimitsLine(multiKitchen);
    expect(line).not.toContain("14-day free trial");
    expect(line).toContain("Trial starts on Kitchen");
  });

  it("still promises every service-company plan its own 14-day trial (TRIAL_PLAN_BY_KIND.service_provider = pro covers all of them)", () => {
    for (const plan of plans) {
      expect(planLimitsLine(plan)).toContain("14-day free trial");
    }
  });
});

describe("formatPrice", () => {
  it("formats whole dollars with a thousands separator and no decimals", () => {
    expect(formatPrice(0)).toBe("$0");
    expect(formatPrice(79)).toBe("$79");
    expect(formatPrice(1990)).toBe("$1,990");
  });
});
