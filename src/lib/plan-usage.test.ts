import { describe, expect, it } from "vitest";
import {
  NEAR_LIMIT_THRESHOLD,
  anyAtLimit,
  anyNearLimit,
  computeUsageStat,
  lockedSinceIso,
  nextPlanUp,
  recommendedPlanFor,
  usageMetricsFor,
} from "@/lib/plan-usage";
import { getPlan } from "@/lib/plans";

describe("computeUsageStat", () => {
  it("is not near or at limit well under the cap", () => {
    const stat = computeUsageStat({ key: "equipment", label: "units", count: 10, limit: 50 });
    expect(stat.pct).toBeCloseTo(0.2);
    expect(stat.atLimit).toBe(false);
    expect(stat.nearLimit).toBe(false);
  });

  it("is near limit at the 80% threshold", () => {
    const stat = computeUsageStat({ key: "equipment", label: "units", count: 40, limit: 50 });
    expect(stat.pct).toBeCloseTo(0.8);
    expect(stat.nearLimit).toBe(true);
    expect(stat.atLimit).toBe(false);
  });

  it("is at limit once count reaches the cap", () => {
    const stat = computeUsageStat({ key: "equipment", label: "units", count: 50, limit: 50 });
    expect(stat.atLimit).toBe(true);
    expect(stat.nearLimit).toBe(true);
  });

  it("treats a null limit as unlimited — never near or at limit", () => {
    const stat = computeUsageStat({ key: "members", label: "team members", count: 999, limit: null });
    expect(stat.pct).toBeNull();
    expect(stat.atLimit).toBe(false);
    expect(stat.nearLimit).toBe(false);
  });

  it("treats a zero limit as already fully at limit", () => {
    const stat = computeUsageStat({ key: "locations", label: "locations", count: 0, limit: 0 });
    expect(stat.atLimit).toBe(true);
    expect(stat.pct).toBe(1);
    expect(stat.nearLimit).toBe(true);
  });
});

describe("usageMetricsFor", () => {
  it("tracks equipment + team members for a provider kind", () => {
    const stats = usageMetricsFor({
      kind: "service_provider",
      equipmentCount: 5,
      memberCount: 1,
      locationCount: 0,
      plan: getPlan("starter"),
    });
    expect(stats.map((s) => s.key)).toEqual(["equipment", "members"]);
  });

  it("tracks equipment + locations for owner kind, not members", () => {
    const stats = usageMetricsFor({
      kind: "equipment_owner",
      equipmentCount: 5,
      memberCount: 3,
      locationCount: 1,
      plan: getPlan("free"),
    });
    expect(stats.map((s) => s.key)).toEqual(["equipment", "locations"]);
  });
});

describe("anyAtLimit / anyNearLimit", () => {
  it("is false when every metric is comfortably under", () => {
    const stats = usageMetricsFor({
      kind: "service_provider",
      equipmentCount: 1,
      memberCount: 1,
      locationCount: 0,
      plan: getPlan("pro"),
    });
    expect(anyAtLimit(stats)).toBe(false);
    expect(anyNearLimit(stats)).toBe(false);
  });

  it("is true when at least one metric crosses its threshold", () => {
    const stats = usageMetricsFor({
      kind: "service_provider",
      equipmentCount: 2,
      memberCount: 2,
      locationCount: 0,
      plan: getPlan("starter"), // memberLimit 2 — at limit
    });
    expect(anyAtLimit(stats)).toBe(true);
    expect(anyNearLimit(stats)).toBe(true);
  });
});

describe("nextPlanUp", () => {
  it("returns the next tier up for a provider mid-lineup plan", () => {
    expect(nextPlanUp("service_provider", "starter")?.id).toBe("pro");
  });

  it("returns null once already on the top provider plan", () => {
    expect(nextPlanUp("service_provider", "business")).toBeNull();
  });

  it("returns the next tier up for an owner mid-lineup plan", () => {
    expect(nextPlanUp("equipment_owner", "free")?.id).toBe("site");
  });

  it("returns null once already on the top owner plan", () => {
    expect(nextPlanUp("equipment_owner", "multi_site")).toBeNull();
  });
});

describe("recommendedPlanFor", () => {
  it("recommends the cheapest plan that already fits low usage", () => {
    expect(
      recommendedPlanFor({ kind: "service_provider", equipmentCount: 5, memberCount: 1 }).id
    ).toBe("starter");
  });

  it("skips a plan whose member limit doesn't fit even if equipment fits", () => {
    expect(
      recommendedPlanFor({ kind: "service_provider", equipmentCount: 5, memberCount: 5 }).id
    ).toBe("pro");
  });

  it("recommends the top plan once usage exceeds every tier", () => {
    expect(
      recommendedPlanFor({ kind: "service_provider", equipmentCount: 5000, memberCount: 1 }).id
    ).toBe("business");
  });

  it("works for owner kind too", () => {
    expect(
      recommendedPlanFor({ kind: "equipment_owner", equipmentCount: 50, memberCount: 0 }).id
    ).toBe("site");
  });
});

describe("lockedSinceIso", () => {
  it("prefers trial_ends_at when present", () => {
    expect(lockedSinceIso("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z")).toBe(
      "2026-01-01T00:00:00Z"
    );
  });

  it("falls back to current_period_end when there was no trial", () => {
    expect(lockedSinceIso(null, "2026-02-01T00:00:00Z")).toBe("2026-02-01T00:00:00Z");
  });

  it("is null when neither is known", () => {
    expect(lockedSinceIso(null, null)).toBeNull();
  });
});

describe("NEAR_LIMIT_THRESHOLD", () => {
  it("is 80%, matching the Overview usage card / at-limit banner spec", () => {
    expect(NEAR_LIMIT_THRESHOLD).toBe(0.8);
  });
});
