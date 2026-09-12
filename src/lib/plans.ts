// Single source of truth for EquipQR's subscription plans. Imported by both
// billing logic (src/lib/billing.ts, the checkout/webhook routes) and any
// marketing-facing pricing UI, so plan copy/pricing/limits never drift.
//
// NOTE: `supabase/migrations/0007_billing.sql` seeds a `plan_limits` table
// with the equipmentLimit/memberLimit values below, for the DB-level
// `before insert` trigger on `equipment` (RLS-adjacent enforcement that
// can't call back into this TS module). If you change limits here, update
// that seed data too — see the comment above the `plan_limits` insert.
//
// Owner roadmap (migration 0024, docs/OWNER-ROADMAP-BRIEF.md §3.1.5): a
// company is either a service_provider (the original model, plans below) or
// an equipment_owner (ownerPlans below). `supabase/migrations/0024_owner_foundation.sql`
// seeds the matching `plan_limits` rows (company_kind/max_locations columns)
// — keep that seed in sync with `ownerPlans` the same way.

import type { CompanyKind } from "@/lib/types";

export type ProviderPlanId = "starter" | "pro" | "business";
export type OwnerPlanId = "free" | "site" | "multi_site";
export type PlanId = ProviderPlanId | OwnerPlanId;
export type BillingInterval = "month" | "year";

export type PlanFeatures = {
  aiChat: boolean;
  /** Pre-printed sticker batches. Also globally gated by FEATURES.batchQr in src/lib/features.ts. */
  batchQr: boolean;
  branding: boolean;
  exportApi: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  /** Max equipment records. */
  equipmentLimit: number;
  /** Max staff (owner + technician) profiles. `null` = unlimited. */
  memberLimit: number | null;
  features: PlanFeatures;
  supportLabel: string;
  blurb: string;
  highlights: string[];
  /** Visually emphasised on pricing pages. */
  popular?: boolean;
  kind: CompanyKind;
  /** Owner plans only; null = unlimited / not applicable (every provider plan). */
  locationLimit: number | null;
  /** Display-only retention hint. Nothing enforces it. */
  historyDays: number | null;
};

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    priceYearly: 290,
    equipmentLimit: 50,
    memberLimit: 2,
    features: {
      aiChat: false,
      batchQr: false,
      branding: false,
      exportApi: false,
    },
    supportLabel: "Email support",
    blurb: "For a single truck getting off paper and text threads.",
    highlights: [
      "Up to 50 units of equipment",
      "2 team members",
      "AI-drafted troubleshooting guides",
      "Service requests with photo & video",
      "Email support",
    ],
    kind: "service_provider",
    locationLimit: null,
    historyDays: null,
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 79,
    priceYearly: 790,
    equipmentLimit: 300,
    memberLimit: 10,
    features: {
      aiChat: true,
      batchQr: true,
      branding: true,
      exportApi: false,
    },
    supportLabel: "Priority email support",
    blurb: "For a growing crew that wants fewer truck rolls, not more.",
    highlights: [
      "Up to 300 units of equipment",
      "10 team members",
      "Chat-style AI troubleshooting assistant",
      "Your logo & colors on customer pages",
      "Priority email support",
    ],
    popular: true,
    kind: "service_provider",
    locationLimit: null,
    historyDays: null,
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 199,
    priceYearly: 1990,
    equipmentLimit: 1500,
    memberLimit: null,
    features: {
      aiChat: true,
      batchQr: true,
      branding: true,
      exportApi: true,
    },
    supportLabel: "Priority support",
    blurb: "For multi-crew operations that need it all.",
    highlights: [
      "Up to 1,500 units of equipment",
      "Unlimited team members",
      "Everything in Pro",
      "Data export & API access",
      "Priority support",
    ],
    kind: "service_provider",
    locationLimit: null,
    historyDays: null,
  },
];

// ----------------------------------------------------------------------------
// Owner plans (equipment_owner companies) — docs/OWNER-ROADMAP-BRIEF.md §3.1.5.
// Requester/staff seats are free and unlimited at every tier: memberLimit is
// null everywhere.
// ----------------------------------------------------------------------------

export const ownerPlans: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    equipmentLimit: 10,
    memberLimit: null,
    features: {
      aiChat: false,
      batchQr: false,
      branding: false,
      exportApi: false,
    },
    supportLabel: "Email support",
    blurb: "For one site tracking equipment and taking service requests, at no cost.",
    highlights: [
      "Up to 10 pieces of equipment",
      "1 location",
      "Unlimited staff and vendor contacts",
      "Service requests with photo & video",
      "Email support",
    ],
    kind: "equipment_owner",
    locationLimit: 1,
    historyDays: 30,
  },
  {
    id: "site",
    name: "Site",
    priceMonthly: 24,
    priceYearly: 240,
    equipmentLimit: 75,
    memberLimit: null,
    features: {
      aiChat: true,
      batchQr: true,
      branding: false,
      exportApi: false,
    },
    supportLabel: "Priority email support",
    blurb: "For one location that wants AI troubleshooting and pre-printed QR batches.",
    highlights: [
      "Up to 75 pieces of equipment",
      "1 location",
      "AI-drafted troubleshooting guides",
      "Pre-printed QR code batches",
      "Priority email support",
    ],
    popular: true,
    kind: "equipment_owner",
    locationLimit: 1,
    historyDays: null,
  },
  {
    id: "multi_site",
    name: "Multi-site",
    priceMonthly: 69,
    priceYearly: 690,
    equipmentLimit: 400,
    memberLimit: null,
    features: {
      aiChat: true,
      batchQr: true,
      branding: true,
      exportApi: false,
    },
    supportLabel: "Priority support",
    blurb: "For an owner running multiple sites who wants branding across all of them.",
    highlights: [
      "Up to 400 pieces of equipment",
      "Up to 5 locations",
      "Your logo & colors on customer pages",
      "Everything in Site",
      "Priority support",
    ],
    kind: "equipment_owner",
    locationLimit: 5,
    historyDays: null,
  },
];

export const allPlans: Plan[] = [...plans, ...ownerPlans];

export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "pro";

/** The plan an in-trial company of this kind is treated as having (mirrors enforce_*_limit()/get_company_entitlements() in 0024). */
export const TRIAL_PLAN_BY_KIND: Record<CompanyKind, PlanId> = {
  service_provider: "pro",
  equipment_owner: "site",
};

/** The plan a lapsed (trial ended, no active subscription) company of this kind falls back to. */
export const FREE_PLAN_BY_KIND: Record<CompanyKind, PlanId> = {
  service_provider: "starter",
  equipment_owner: "free",
};

/** All plans available to companies of this kind, in display order. */
export function plansFor(kind: CompanyKind): Plan[] {
  return kind === "equipment_owner" ? ownerPlans : plans;
}

export function getPlan(id: PlanId): Plan {
  const plan = allPlans.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return plan;
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return !!value && allPlans.some((p) => p.id === value);
}

export function canAddEquipment(plan: Plan, currentCount: number): boolean {
  return currentCount < plan.equipmentLimit;
}

export function canAddMember(plan: Plan, currentCount: number): boolean {
  if (plan.memberLimit === null) return true;
  return currentCount < plan.memberLimit;
}

/** Owner plans only in practice (provider plans have locationLimit: null, so this is always true for them). */
export function canAddLocation(plan: Plan, currentCount: number): boolean {
  if (plan.locationLimit === null) return true;
  return currentCount < plan.locationLimit;
}

// ----------------------------------------------------------------------------
// Stripe price id lookup (docs/OWNER-ROADMAP-BRIEF.md §3.4.1 — WS4's half of
// this file; everything above is WS1's). Each paid plan/interval pair maps to
// one of ten env vars — no price ids are hardcoded so they can differ between
// Stripe test and live mode without a code change. `free` has no entry: it's
// the zero-cost floor for equipment_owner companies and needs no checkout.
// ----------------------------------------------------------------------------

const PRICE_ENV_VARS: Record<Exclude<PlanId, "free">, Record<BillingInterval, string>> = {
  starter: {
    month: "STRIPE_PRICE_STARTER_MONTHLY",
    year: "STRIPE_PRICE_STARTER_YEARLY",
  },
  pro: {
    month: "STRIPE_PRICE_PRO_MONTHLY",
    year: "STRIPE_PRICE_PRO_YEARLY",
  },
  business: {
    month: "STRIPE_PRICE_BUSINESS_MONTHLY",
    year: "STRIPE_PRICE_BUSINESS_YEARLY",
  },
  site: {
    month: "STRIPE_PRICE_SITE_MONTHLY",
    year: "STRIPE_PRICE_SITE_YEARLY",
  },
  multi_site: {
    month: "STRIPE_PRICE_MULTI_SITE_MONTHLY",
    year: "STRIPE_PRICE_MULTI_SITE_YEARLY",
  },
};

function isFreePlanId(id: PlanId): id is "free" {
  return id === "free";
}

export function getStripePriceId(planId: PlanId, interval: BillingInterval): string {
  if (isFreePlanId(planId)) {
    throw new Error("The Free plan has no Stripe price — it needs no checkout.");
  }
  const envVar = PRICE_ENV_VARS[planId][interval];
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `Missing Stripe price id: set ${envVar} in your environment to sell the ${planId} plan (${interval}ly).`
    );
  }
  return value;
}

/** All ten env var names, e.g. for a "which price ids are missing" admin check. Never includes a `free` entry. */
export function listStripePriceEnvVars(): string[] {
  return allPlans.flatMap((p) => {
    if (isFreePlanId(p.id)) return [];
    const envVars = PRICE_ENV_VARS[p.id];
    return [envVars.month, envVars.year];
  });
}

/**
 * Reverse-lookup: given a Stripe price id (from a webhook payload), find the
 * matching plan id + interval. Returns null if it doesn't match any of our
 * configured prices (e.g. a stale/unknown price, or the free plan — which
 * never has one).
 */
export function planFromStripePriceId(
  stripePriceId: string
): { planId: Exclude<PlanId, "free">; interval: BillingInterval } | null {
  for (const plan of allPlans) {
    if (isFreePlanId(plan.id)) continue;
    const planId = plan.id;
    for (const interval of ["month", "year"] as const) {
      const envVar = PRICE_ENV_VARS[planId][interval];
      if (process.env[envVar] === stripePriceId) {
        return { planId, interval };
      }
    }
  }
  return null;
}
