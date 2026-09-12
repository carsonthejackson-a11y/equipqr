"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ownerPlans, type BillingInterval } from "@/lib/plans";

// The owner-kind counterpart to pricing-cards.tsx (docs/OWNER-ROADMAP-BRIEF.md
// §3.4). Unlike the provider cards, this owns its own monthly/yearly toggle —
// there's no free plan on the provider side to special-case, but here the
// Free card never shows a price-per-interval or a "start trial" CTA.
export function OwnerPricingCards({ className }: { className?: string }) {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <div className={className}>
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1">
        <button
          type="button"
          role="radio"
          aria-checked={interval === "month"}
          onClick={() => setInterval("month")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            interval === "month"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={interval === "year"}
          onClick={() => setInterval("year")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            interval === "year"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Yearly
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              interval === "year"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-accent text-accent-foreground"
            )}
          >
            2 months free
          </span>
        </button>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {ownerPlans.map((plan) => {
          const isFree = plan.id === "free";
          const price = interval === "month" ? plan.priceMonthly : plan.priceYearly;
          const monthlyEquivalent = Math.round(plan.priceYearly / 12);

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-5 rounded-2xl border bg-card p-6",
                plan.popular ? "border-primary ring-1 ring-primary" : "border-border"
              )}
            >
              {plan.popular ? (
                <Badge className="absolute -top-3 left-6">Most popular</Badge>
              ) : null}

              <div className="space-y-1.5">
                <h3 className="font-heading text-lg font-semibold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.blurb}</p>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">${price}</span>
                {!isFree && (
                  <span className="text-sm text-muted-foreground">
                    /{interval === "month" ? "mo" : "yr"}
                  </span>
                )}
              </div>
              <p className="-mt-4 text-xs text-muted-foreground">
                {isFree
                  ? "Free forever — no credit card, no trial to run out"
                  : interval === "year"
                    ? `Works out to $${monthlyEquivalent}/mo, billed annually`
                    : "Billed monthly, cancel anytime"}
              </p>

              <ul className="flex flex-1 flex-col gap-2.5">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-foreground">{h}</span>
                  </li>
                ))}
              </ul>

              <Button
                render={<Link href={`/signup?kind=owner&plan=${plan.id}`} />}
                nativeButton={false}
                variant={plan.popular ? "default" : "outline"}
                className="w-full"
                size="lg"
              >
                {isFree ? "Get started free" : "Start free trial"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
