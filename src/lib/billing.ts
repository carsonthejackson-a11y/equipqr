import "server-only";
import { createClient } from "@/lib/supabase/server";
import { canAddEquipment, canAddMember, getPlan, isPlanId, type Plan, type PlanFeatures, type PlanId } from "@/lib/plans";

export type Entitlements = {
  plan_id: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid" | "paused" | "none";
  trial_ends_at: string | null;
  current_period_end: string | null;
  equipment_count: number;
  member_count: number;
  is_trialing: boolean;
  is_locked: boolean;
};

/**
 * Entitlements for the CURRENTLY AUTHENTICATED user's company (via
 * get_my_company_id() inside the RPC). Returns null if the caller isn't
 * authenticated/has no company yet, or if the RPC fails for any reason
 * (e.g. migration 0007 not applied yet in this environment) — callers
 * should treat null as "unknown, don't block" rather than "locked".
 */
export async function getEntitlements(): Promise<Entitlements | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_entitlements");

  if (error || !data) {
    if (error) {
      console.error("get_company_entitlements failed:", error.message);
    }
    return null;
  }

  const raw = data as Record<string, unknown>;
  return {
    plan_id: isPlanId(raw.plan_id as string) ? (raw.plan_id as PlanId) : "starter",
    status: (raw.status as Entitlements["status"]) ?? "none",
    trial_ends_at: (raw.trial_ends_at as string | null) ?? null,
    current_period_end: (raw.current_period_end as string | null) ?? null,
    equipment_count: Number(raw.equipment_count ?? 0),
    member_count: Number(raw.member_count ?? 0),
    is_trialing: !!raw.is_trialing,
    is_locked: !!raw.is_locked,
  };
}

/** The full Plan record for the caller's current entitlements (trial companies resolve to TRIAL_PLAN). */
export function planFor(entitlements: Entitlements): Plan {
  return getPlan(entitlements.plan_id);
}

export function hasFeature(entitlements: Entitlements | null, feature: keyof PlanFeatures): boolean {
  if (!entitlements) return false;
  return planFor(entitlements).features[feature];
}

/**
 * Guard for server actions that should be blocked once a company's trial has
 * ended and it has no active subscription. Returns null when fine to
 * proceed, or a `{ error }` to return directly from the calling action.
 * Fails open (returns null) if entitlements can't be determined, so a
 * billing hiccup never blocks core product usage.
 */
export async function requireActiveSubscription(): Promise<{ error: string } | null> {
  const entitlements = await getEntitlements();
  if (!entitlements) return null;

  if (entitlements.is_locked) {
    return { error: "Your trial has ended. Choose a plan on the Billing page to keep going." };
  }
  return null;
}

/**
 * Guard for createEquipment(): blocks once the company is locked, or once
 * it's at its plan's equipment limit. Returns null when fine to proceed.
 */
export async function assertCanAddEquipment(): Promise<{ error: string } | null> {
  const entitlements = await getEntitlements();
  if (!entitlements) return null;

  if (entitlements.is_locked) {
    return { error: "Your trial has ended. Choose a plan on the Billing page to keep going." };
  }

  const plan = planFor(entitlements);
  if (!canAddEquipment(plan, entitlements.equipment_count)) {
    return {
      error: `You've reached the ${plan.equipmentLimit}-unit limit of the ${plan.name} plan. Upgrade to add more.`,
    };
  }

  return null;
}

/**
 * Guard for inviteMember(): blocks once the company is locked, or once
 * current members + pending invitations are at the plan's member limit
 * (trialing companies use TRIAL_PLAN's — currently Pro's — limit, same as
 * everywhere else entitlements are resolved). Returns null when fine to
 * proceed. Counts pending invitations too so a company can't out-invite its
 * seat count by sending more invites than it has room for members.
 */
export async function assertCanAddMember(): Promise<{ error: string } | null> {
  const entitlements = await getEntitlements();
  if (!entitlements) return null;

  if (entitlements.is_locked) {
    return { error: "Your trial has ended. Choose a plan on the Billing page to keep going." };
  }

  const plan = planFor(entitlements);
  if (plan.memberLimit === null) return null;

  const supabase = await createClient();
  // RLS ("Owners view own company invitations") already scopes this to the
  // caller's own company — inviteMember() only reaches here after
  // requireOwner() has confirmed the caller is an owner.
  const { count } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const totalSeats = entitlements.member_count + (count ?? 0);
  if (!canAddMember(plan, totalSeats)) {
    return {
      error: `You've reached the ${plan.memberLimit}-member limit of the ${plan.name} plan (including pending invitations). Upgrade or revoke a pending invite to add more.`,
    };
  }

  return null;
}

/**
 * Public-safe plan flags for an anonymous viewer of a QR guide (the
 * /e/[qrToken] flow — no authenticated staff session to resolve
 * get_my_company_id() from). Takes the company id directly since it's
 * already exposed to that flow via resolve_qr_code.
 */
export async function getCompanyPlanFlags(
  companyId: string
): Promise<{ plan_id: PlanId; is_trialing: boolean; is_locked: boolean } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_plan_flags", { p_company_id: companyId });

  if (error || !data) {
    if (error) {
      console.error("get_company_plan_flags failed:", error.message);
    }
    return null;
  }

  const raw = data as Record<string, unknown>;
  return {
    plan_id: isPlanId(raw.plan_id as string) ? (raw.plan_id as PlanId) : "starter",
    is_trialing: !!raw.is_trialing,
    is_locked: !!raw.is_locked,
  };
}
