// Single source of truth for EquipQR's subscription plans. Imported by both
// billing logic (src/lib/billing.ts, the checkout/webhook routes) and any
// marketing-facing pricing UI, so plan copy/pricing/limits never drift.
//
// NOTE: `supabase/migrations/0007_billing.sql` seeds a `plan_limits` table
// with the equipmentLimit/memberLimit values below, for the DB-level
// `before insert` trigger on `equipment` (RLS-adjacent enforcement that
// can't call back into this TS module). If you change limits here, update
// that seed data too — see the comment above the `plan_limits` insert.

export type PlanId = "starter" | "pro" | "business";
export type BillingInterval = "month" | "year";

export type PlanFeatures = {
  aiChat: boolean;
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
    blurb: "For a single tech getting a handle on their equipment list.",
    highlights: [
      "Up to 50 pieces of equipment",
      "2 staff seats",
      "QR troubleshooting guides",
      "Email support",
    ],
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
      branding: false,
      exportApi: false,
    },
    supportLabel: "Priority email support",
    blurb: "For a growing crew that needs AI-assisted troubleshooting.",
    highlights: [
      "Up to 300 pieces of equipment",
      "10 staff seats",
      "AI chat troubleshooting",
      "Pre-printed batch QR codes",
      "Priority email support",
    ],
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
    supportLabel: "Priority phone & email support",
    blurb: "For multi-crew operations that need branding and data export.",
    highlights: [
      "Up to 1,500 pieces of equipment",
      "Unlimited staff seats",
      "AI chat troubleshooting",
      "Pre-printed batch QR codes",
      "Custom branding on guides",
      "Data export API",
      "Priority phone & email support",
    ],
  },
];

export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "pro";

export function getPlan(id: PlanId): Plan {
  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return plan;
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return !!value && plans.some((p) => p.id === value);
}

export function canAddEquipment(plan: Plan, currentCount: number): boolean {
  return currentCount < plan.equipmentLimit;
}

export function canAddMember(plan: Plan, currentCount: number): boolean {
  if (plan.memberLimit === null) return true;
  return currentCount < plan.memberLimit;
}

// ----------------------------------------------------------------------------
// Stripe price id lookup. Each plan/interval pair maps to one of six env
// vars — no price ids are hardcoded so they can differ between Stripe test
// and live mode without a code change.
// ----------------------------------------------------------------------------

const PRICE_ENV_VARS: Record<PlanId, Record<BillingInterval, string>> = {
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
};

export function getStripePriceId(planId: PlanId, interval: BillingInterval): string {
  const envVar = PRICE_ENV_VARS[planId][interval];
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `Missing Stripe price id: set ${envVar} in your environment to sell the ${planId} plan (${interval}ly).`
    );
  }
  return value;
}

/** All six env var names, e.g. for a "which price ids are missing" admin check. */
export function listStripePriceEnvVars(): string[] {
  return plans.flatMap((p) => [PRICE_ENV_VARS[p.id].month, PRICE_ENV_VARS[p.id].year]);
}

/**
 * Reverse-lookup: given a Stripe price id (from a webhook payload), find the
 * matching plan id + interval. Returns null if it doesn't match any of our
 * configured prices (e.g. a stale/unknown price).
 */
export function planFromStripePriceId(
  stripePriceId: string
): { planId: PlanId; interval: BillingInterval } | null {
  for (const plan of plans) {
    for (const interval of ["month", "year"] as const) {
      const envVar = PRICE_ENV_VARS[plan.id][interval];
      if (process.env[envVar] === stripePriceId) {
        return { planId: plan.id, interval };
      }
    }
  }
  return null;
}
