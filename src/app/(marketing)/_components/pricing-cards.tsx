import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { plans, type BillingInterval } from "@/lib/plans";

export function PricingCards({
  interval,
  className,
}: {
  interval: BillingInterval;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-5 md:grid-cols-3", className)}>
      {plans.map((plan) => {
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
              <span className="text-sm text-muted-foreground">
                /{interval === "month" ? "mo" : "yr"}
              </span>
            </div>
            <p className="-mt-4 text-xs text-muted-foreground">
              {interval === "year"
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
              render={<Link href={`/signup?plan=${plan.id}`} />}
              nativeButton={false}
              variant={plan.popular ? "default" : "outline"}
              className="w-full"
              size="lg"
            >
              Start free trial
            </Button>
          </div>
        );
      })}
    </div>
  );
}
