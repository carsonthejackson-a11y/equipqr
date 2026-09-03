// Billing logic lives in billing workstream; keep this shape.

export type PlanId = "starter" | "pro" | "business";
export type BillingInterval = "month" | "year";

export type Plan = {
  id: PlanId;
  name: string;
  blurb: string;
  priceMonthly: number;
  priceYearly: number;
  equipmentLimit: number;
  memberLimit: number | null;
  features: {
    aiChat: boolean;
    batchQr: boolean;
    branding: boolean;
    exportApi: boolean;
  };
  supportLabel: string;
  highlights: string[];
  popular?: boolean;
};

export const TRIAL_DAYS = 14;
export const TRIAL_PLAN: PlanId = "pro";

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    blurb: "For a single truck getting off paper and text threads.",
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
    highlights: [
      "Up to 50 units of equipment",
      "2 team members",
      "AI-drafted troubleshooting guides",
      "Service requests with photo & video",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For a growing crew that wants fewer truck rolls, not more.",
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
    highlights: [
      "Up to 300 units of equipment",
      "10 team members",
      "Chat-style AI troubleshooting assistant",
      "Pre-printed batch QR sticker orders",
      "Your logo & colors on customer pages",
      "Priority email support",
    ],
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    blurb: "For multi-crew operations that need it all, plus a hand getting set up.",
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
    supportLabel: "Priority support + onboarding call",
    highlights: [
      "Up to 1,500 units of equipment",
      "Unlimited team members",
      "Data export & API access",
      "Everything in Pro",
      "Priority support + onboarding call",
    ],
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return plan;
}
