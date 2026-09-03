"use client";

import { useState } from "react";
import { PricingCards } from "../_components/pricing-cards";
import type { BillingInterval } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function PricingToggle() {
  const [interval, setInterval] = useState<BillingInterval>("month");

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Billing interval"
        className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
      >
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

      <PricingCards interval={interval} className="mt-10" />
    </div>
  );
}
