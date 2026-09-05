"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { plans, type BillingInterval, type PlanId } from "@/lib/plans";

export function PlanCards({
  currentPlanId,
  hasActiveSubscription,
  stripeConfigured,
  onCheckout,
  onOpenPortal,
}: {
  currentPlanId: PlanId;
  /**
   * Whether a live Stripe subscription sits behind `currentPlanId`. Changing
   * one is a Customer Portal job (a second Checkout would double-subscribe
   * the customer), so these cards become read-only when it's true. An in-app
   * trial is NOT a subscription: a trialing company can still buy any plan
   * here, including the one its trial is modelled on.
   */
  hasActiveSubscription: boolean;
  stripeConfigured: boolean;
  onCheckout: (planId: PlanId, interval: BillingInterval) => Promise<{ error: string } | void>;
  onOpenPortal: () => Promise<{ error: string } | void>;
}) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [pendingPlanId, setPendingPlanId] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChoose(planId: PlanId) {
    setError(null);
    setPendingPlanId(planId);
    startTransition(async () => {
      const result = await onCheckout(planId, interval);
      if (result?.error) {
        setError(result.error);
      }
      setPendingPlanId(null);
    });
  }

  function handleManage() {
    setError(null);
    startTransition(async () => {
      const result = await onOpenPortal();
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-[3px] text-sm">
          {(["month", "year"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setInterval(opt)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                interval === opt
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = hasActiveSubscription && plan.id === currentPlanId;
          const price = interval === "month" ? plan.priceMonthly : plan.priceYearly;
          return (
            <Card key={plan.id} className={cn(isCurrent && "ring-2 ring-primary")}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current plan</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{plan.blurb}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p>
                  <span className="text-2xl font-semibold">${price}</span>
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    / {interval === "month" ? "month" : "year"}
                  </span>
                </p>
                <ul className="space-y-1.5 text-sm">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              {!hasActiveSubscription && (
                <CardFooter>
                  <Button
                    className="w-full"
                    disabled={!stripeConfigured || (isPending && pendingPlanId === plan.id)}
                    onClick={() => handleChoose(plan.id)}
                  >
                    {isPending && pendingPlanId === plan.id ? "Redirecting…" : "Choose plan"}
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      {hasActiveSubscription && (
        <div className="space-y-1.5">
          <Button variant="outline" disabled={!stripeConfigured || isPending} onClick={handleManage}>
            {isPending ? "Opening…" : "Manage billing"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Switch plans, update payment method, or cancel in the Stripe billing portal.
          </p>
        </div>
      )}
    </div>
  );
}
