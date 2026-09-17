// Pure plan-usage math shared by the at-limit banners (equipment page,
// locations page), the Overview usage card, and the locked screen's
// usage-based plan recommendation (docs/QOL-CONTINUITY-BRIEF.md items 6-7).
// Kept separate from src/lib/plans.ts (the shared plan/limit catalogue
// QoL-3 doesn't own) and src/lib/billing.ts (server-only) so this stays a
// plain, client-safe, unit-testable module.

import { getPlan, plansFor, type Plan, type PlanId } from "@/lib/plans";
import type { CompanyKind } from "@/lib/types";

export type UsageMetricKey = "equipment" | "members" | "locations";

export type UsageMetric = {
  key: UsageMetricKey;
  label: string;
  count: number;
  /** null = unlimited (e.g. every provider plan's locationLimit, Business's memberLimit). */
  limit: number | null;
};

export type UsageStat = UsageMetric & {
  /** 0-1+, or null when `limit` is null — no fraction is meaningful for "unlimited". */
  pct: number | null;
  atLimit: boolean;
  nearLimit: boolean;
};

/** Overview's usage card and the at-limit banners both key off this. */
export const NEAR_LIMIT_THRESHOLD = 0.8;

export function computeUsageStat(metric: UsageMetric): UsageStat {
  const atLimit = metric.limit !== null && metric.count >= metric.limit;
  // A <=0 limit (never happens today, but keeps this total) reads as fully
  // used rather than dividing by zero — consistent with atLimit above.
  const pct = metric.limit === null ? null : metric.limit <= 0 ? 1 : metric.count / metric.limit;
  const nearLimit = pct !== null && pct >= NEAR_LIMIT_THRESHOLD;
  return { ...metric, pct, atLimit, nearLimit };
}

/**
 * The metrics this company's kind tracks against its plan: equipment always,
 * plus locations (owner kind) or team members (provider kind) — the other
 * of that pair is never meaningful for the opposite kind (providers never
 * create `locations` rows; owner seats are free/unlimited at every tier —
 * src/lib/billing.ts, src/lib/plans.ts).
 */
export function usageMetricsFor(params: {
  kind: CompanyKind;
  equipmentCount: number;
  memberCount: number;
  locationCount: number;
  plan: Plan;
}): UsageStat[] {
  const metrics: UsageMetric[] = [
    {
      key: "equipment",
      label: "units of equipment",
      count: params.equipmentCount,
      limit: params.plan.equipmentLimit,
    },
  ];
  if (params.kind === "equipment_owner") {
    metrics.push({
      key: "locations",
      label: "locations",
      count: params.locationCount,
      limit: params.plan.locationLimit,
    });
  } else {
    metrics.push({
      key: "members",
      label: "team members",
      count: params.memberCount,
      limit: params.plan.memberLimit,
    });
  }
  return metrics.map(computeUsageStat);
}

export function anyAtLimit(stats: UsageStat[]): boolean {
  return stats.some((s) => s.atLimit);
}

export function anyNearLimit(stats: UsageStat[]): boolean {
  return stats.some((s) => s.nearLimit);
}

/**
 * The next plan up from `currentPlanId` in this kind's lineup (display
 * order in plans.ts, cheapest first), or null when already on the top
 * plan. Used to name a specific upgrade target on the at-limit banners
 * rather than a bare "upgrade" nudge (docs/QOL-CONTINUITY-BRIEF.md item 6).
 */
export function nextPlanUp(kind: CompanyKind, currentPlanId: PlanId): Plan | null {
  const ordered = plansFor(kind);
  const index = ordered.findIndex((p) => p.id === currentPlanId);
  if (index === -1 || index === ordered.length - 1) return null;
  return ordered[index + 1];
}

/**
 * The cheapest plan in this kind's lineup whose limits already cover the
 * company's current usage — the locked screen's "recommended for you" plan
 * (docs/QOL-CONTINUITY-BRIEF.md item 7). Falls back to the top plan of the
 * lineup when usage exceeds every tier (nothing "fits" exactly, so the
 * highest is the best available answer).
 */
export function recommendedPlanFor(params: {
  kind: CompanyKind;
  equipmentCount: number;
  memberCount: number;
}): Plan {
  const ordered = plansFor(params.kind);
  const fits = ordered.find(
    (p) =>
      params.equipmentCount <= p.equipmentLimit &&
      (p.memberLimit === null || params.memberCount <= p.memberLimit)
  );
  if (fits) return fits;
  return getPlan(params.kind === "equipment_owner" ? "multi_site" : "business");
}

/**
 * The instant a locked company's paywall began, for "since you were locked"
 * copy — trial end, or (a company that never had a trial, e.g. one whose
 * subscription later lapsed) its last paid period's end. Null when neither
 * is known, so the caller can drop the specific "since X" claim instead of
 * guessing.
 */
export function lockedSinceIso(trialEndsAt: string | null, currentPeriodEnd: string | null): string | null {
  return trialEndsAt ?? currentPeriodEnd ?? null;
}
