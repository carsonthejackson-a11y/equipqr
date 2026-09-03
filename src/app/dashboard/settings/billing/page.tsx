import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getEntitlements, planFor } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";
import type { Profile } from "@/lib/types";
import { createCheckoutSession, createPortalSession } from "./actions";
import { PlanCards } from "./plan-cards";
import { ManageBillingButton } from "./manage-billing-button";
import { SettingsSubnav } from "../settings-subnav";

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  unpaid: "Unpaid",
  paused: "Paused",
  none: "No subscription",
};

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "trialing") return "secondary";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "destructive";
  return "outline";
}

function daysLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default async function BillingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) {
    notFound();
  }

  if (profile.role !== "owner") {
    return (
      <div className="space-y-6">
        <SettingsSubnav />
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-muted-foreground">Plan, usage, and payment details.</p>
        </div>
        <Alert>
          <AlertTitle>Owners only</AlertTitle>
          <AlertDescription>
            Billing is managed by your company&apos;s owner. Ask your owner if you need a plan
            changed or a receipt.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("stripe_customer_id")
    .eq("id", profile.company_id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  const entitlements = await getEntitlements();
  const stripeConfigured = isStripeConfigured();

  if (!entitlements) {
    return (
      <div className="space-y-6">
        <SettingsSubnav />
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-muted-foreground">Plan, usage, and payment details.</p>
        </div>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load billing details</AlertTitle>
          <AlertDescription>
            Something went wrong loading your subscription status. Try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const plan = planFor(entitlements);
  const hasActivePlan = entitlements.is_trialing || entitlements.status === "active";

  return (
    <div className="space-y-6">
      <SettingsSubnav />
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-muted-foreground">Plan, usage, and payment details.</p>
      </div>

      {!stripeConfigured && (
        <Alert>
          <AlertTitle>Stripe not configured</AlertTitle>
          <AlertDescription>
            This environment doesn&apos;t have STRIPE_SECRET_KEY set, so checkout and the billing
            portal are disabled here. See docs/BILLING.md for setup — plan cards below are
            preview-only until it&apos;s configured.
          </AlertDescription>
        </Alert>
      )}

      {entitlements.is_locked && (
        <Alert variant="destructive">
          <AlertTitle>Your trial has ended</AlertTitle>
          <AlertDescription>Choose a plan below to keep using EquipQR.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Current plan: {plan.name}</CardTitle>
            <Badge variant={statusBadgeVariant(entitlements.status)}>
              {STATUS_LABEL[entitlements.status] ?? entitlements.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {entitlements.is_trialing && entitlements.trial_ends_at && (
            <p className="text-sm text-muted-foreground">
              {daysLeft(entitlements.trial_ends_at)} day
              {daysLeft(entitlements.trial_ends_at) === 1 ? "" : "s"} left in your trial — you have
              full {plan.name} features until then.
            </p>
          )}
          {entitlements.status === "active" && entitlements.current_period_end && (
            <p className="text-sm text-muted-foreground">
              Renews {new Date(entitlements.current_period_end).toLocaleDateString()}.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>Equipment</span>
                <span className="text-muted-foreground">
                  {entitlements.equipment_count} / {plan.equipmentLimit}
                </span>
              </div>
              <Progress
                value={Math.min(100, (entitlements.equipment_count / plan.equipmentLimit) * 100)}
                indicatorClassName={
                  entitlements.equipment_count >= plan.equipmentLimit ? "bg-destructive" : undefined
                }
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span>Team members</span>
                <span className="text-muted-foreground">
                  {entitlements.member_count} / {plan.memberLimit ?? "Unlimited"}
                </span>
              </div>
              <Progress
                value={
                  plan.memberLimit === null
                    ? 0
                    : Math.min(100, (entitlements.member_count / plan.memberLimit) * 100)
                }
                indicatorClassName={
                  plan.memberLimit !== null && entitlements.member_count >= plan.memberLimit
                    ? "bg-destructive"
                    : undefined
                }
              />
            </div>
          </div>

          {company?.stripe_customer_id && (
            <ManageBillingButton onOpenPortal={createPortalSession} />
          )}
        </CardContent>
      </Card>

      <PlanCards
        currentPlanId={entitlements.plan_id}
        hasActivePlan={hasActivePlan}
        stripeConfigured={stripeConfigured}
        onCheckout={createCheckoutSession}
      />
    </div>
  );
}
