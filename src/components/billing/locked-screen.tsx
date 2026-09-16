import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, isLiveSubscriptionStatus } from "@/lib/billing";
import { plansFor } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { lockedSinceIso, recommendedPlanFor } from "@/lib/plan-usage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCheckoutSession, createPortalSession } from "@/app/dashboard/settings/billing/actions";
import { PlanCards } from "@/app/dashboard/settings/billing/plan-cards";
import type { CompanyKind } from "@/lib/types";

/**
 * Rendered by dashboard/layout.tsx in place of `children` once a
 * service_provider company is locked (trial ended, no active subscription).
 * equipment_owner companies are never locked and always have a Free tier to
 * land on (docs/OWNER-ROADMAP-BRIEF.md §9 Q1) — the `companyKind` prop is
 * kept optional and checked here purely as a belt-and-suspenders guard,
 * since the layout's own `isLocked` already excludes that kind before this
 * ever renders.
 *
 * Fetches its own entitlements/subscription/usage data rather than taking
 * it as props, so it stays a self-contained drop-in for the layout's
 * existing `<LockedScreen isOwner={...} />` call — no change to that file
 * was needed for this rewrite (docs/QOL-CONTINUITY-BRIEF.md item 7: honest
 * "your data is safe" reassurance with a real request count, a usage-based
 * plan recommendation, and live plan cards instead of a dead end).
 */
export async function LockedScreen({
  isOwner,
  companyKind,
}: {
  isOwner: boolean;
  companyKind?: CompanyKind;
}) {
  if (companyKind === "equipment_owner") return null;

  const entitlements = await getEntitlements();

  // Fails open to the original minimal message rather than rendering
  // nothing — should be unreachable in practice (dashboard/layout.tsx
  // already resolved entitlements to decide to render this component at
  // all), but a failed/owner-kind lookup here must never strand a locked
  // owner with no way to reach Billing.
  if (!entitlements || entitlements.company_kind === "equipment_owner") {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Your trial has ended</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {isOwner
                ? "Choose a plan to keep managing equipment, guides, and service requests."
                : "Your company's trial has ended. Ask your account owner to choose a plan to keep going."}
            </p>
            {isOwner && (
              <Button render={<Link href="/dashboard/settings/billing" />} nativeButton={false}>
                Choose a plan
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  // trial_ends_at (or, for a company that never had a trial, its last paid
  // period's end) — the instant the paywall began, for the "since then"
  // request count below. RLS ("Staff can view own company subscription")
  // already scopes both queries to this company; no explicit company_id
  // filter needed (billing/page.tsx's read of the same table filters
  // explicitly because it already has profile.company_id in hand there —
  // this component intentionally doesn't fetch a profile just for that).
  const sinceIso = lockedSinceIso(entitlements.trial_ends_at, entitlements.current_period_end);

  const [{ count: requestsSinceLocked }, { data: subscription }] = await Promise.all([
    sinceIso
      ? supabase
          .from("service_requests")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceIso)
      : Promise.resolve({ count: null as number | null }),
    supabase.from("subscriptions").select("status").maybeSingle<{ status: string }>(),
  ]);

  const recommended = recommendedPlanFor({
    kind: entitlements.company_kind,
    equipmentCount: entitlements.equipment_count,
    memberCount: entitlements.member_count,
  });
  const hasActiveSubscription = isLiveSubscriptionStatus(subscription?.status);

  const n = requestsSinceLocked ?? 0;
  // "Your stickers still work" is true even when sinceIso is unknown (an
  // edge case this codebase probably never hits in practice), so only the
  // specific request-count claim is conditional on actually knowing when
  // to count from.
  const reassurance = sinceIso
    ? `Your stickers still work — customers have sent ${n} request${n === 1 ? "" : "s"} since your trial ended. Your data is safe.`
    : "Your stickers still work. Your data is safe.";

  if (!isOwner) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Your trial has ended</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{reassurance}</p>
            <p className="text-muted-foreground">
              Ask your account owner to choose a plan to keep going.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-10">
      <div className="mx-auto max-w-xl space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Your trial has ended</h1>
        <p className="text-muted-foreground">{reassurance}</p>
        <p className="text-sm text-muted-foreground">
          Based on your usage, we recommend the <strong>{recommended.name}</strong> plan.
        </p>
      </div>

      <PlanCards
        plans={plansFor(entitlements.company_kind)}
        currentPlanId={entitlements.plan_id}
        hasActiveSubscription={hasActiveSubscription}
        stripeConfigured={isStripeConfigured()}
        onCheckout={createCheckoutSession}
        onOpenPortal={createPortalSession}
        recommendedPlanId={recommended.id}
      />
    </div>
  );
}
