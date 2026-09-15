import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/lib/features";
import type { BillingInterval, Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { FeatureList } from "./feature-list";
import { headingClass } from "./kicker";
import { Panel } from "./panel";
import { Tag } from "./tag";

// README §3 Pricing plan card. The plan name is a real <h3> with the name as
// its only text and the price numeral is one text node (`$79`) so the e2e
// locators (`getByRole("heading", { name })`, `getByText("$79")`) keep
// matching. `compact` is the Restaurants teaser card (name + price on one
// line, blurb, one limits line, no list or CTA).

export function formatPrice(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

/** Card highlights, minus the pre-printed batch line when the feature is off. */
export function planHighlights(plan: Plan): string[] {
  return FEATURES.batchQr ? plan.highlights : plan.highlights.filter((h) => !h.includes("Pre-printed"));
}

/** The short "· separated" limits line the compact card shows. */
export function planLimitsLine(plan: Plan): string {
  const units = plan.equipmentLimit.toLocaleString("en-US");
  const parts: string[] = [];
  if (plan.kind === "equipment_owner") {
    parts.push(`Up to ${units} pieces of equipment`);
    parts.push(plan.locationLimit === 1 ? "1 location" : `Up to ${plan.locationLimit ?? "unlimited"} locations`);
    parts.push(plan.priceMonthly === 0 ? "Unlimited staff" : "14-day free trial");
  } else {
    parts.push(`Up to ${units} units of equipment`);
    parts.push(plan.memberLimit === null ? "Unlimited team members" : `${plan.memberLimit} team members`);
    parts.push("14-day free trial");
  }
  return parts.join(" · ");
}

export type PlanCardProps = {
  plan: Plan;
  interval: BillingInterval;
  /** Accent border, ring and glow plus the `Most popular` tag. Defaults to `plan.popular`. */
  highlighted?: boolean;
  ctaHref?: string;
  ctaLabel?: React.ReactNode;
  ctaVariant?: "brand" | "neutral";
  /** Restaurants teaser layout. */
  compact?: boolean;
  /** Override the compact card's limits line. */
  limits?: string;
  className?: string;
};

export function PlanCard({
  plan,
  interval,
  highlighted = plan.popular ?? false,
  ctaHref,
  ctaLabel = "Start free trial",
  ctaVariant,
  compact = false,
  limits,
  className,
}: PlanCardProps) {
  const isFree = plan.priceMonthly === 0;
  const amount = interval === "month" ? plan.priceMonthly : plan.priceYearly;
  const unit = isFree ? null : interval === "month" ? "/mo" : "/yr";
  const subline = isFree
    ? "Free forever. No credit card, no trial to run out."
    : interval === "month"
      ? "Billed monthly, cancel anytime"
      : `Works out to ${formatPrice(Math.round(plan.priceYearly / 12))}/mo, billed annually`;
  const popularTag = highlighted ? <Tag>Most popular</Tag> : null;

  if (compact) {
    return (
      <Panel as="article" highlighted={highlighted} className={cn("flex flex-col gap-[14px]", className)}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-center gap-[10px]">
            <h3 className={headingClass.h3}>{plan.name}</h3>
            {popularTag}
          </div>
          <span className="text-[22px] font-medium tracking-[-0.02em] whitespace-nowrap tabular-nums">
            {formatPrice(amount)}
            {unit ? <span className="text-[13px] font-normal text-eq-neutral-500">{unit}</span> : null}
          </span>
        </div>
        <p className="text-[14.5px] leading-[1.55] text-eq-neutral-400">{plan.blurb}</p>
        <p className="mt-auto pt-2 text-[13px] leading-[1.5] text-eq-neutral-500">{limits ?? planLimitsLine(plan)}</p>
      </Panel>
    );
  }

  return (
    <Panel as="article" highlighted={highlighted} className={cn("flex h-full flex-col gap-5", className)}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className={headingClass.h3}>{plan.name}</h3>
          {popularTag}
        </div>
        <p className="text-[14.5px] leading-[1.55] text-eq-neutral-400">{plan.blurb}</p>
      </div>
      <div>
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="text-[clamp(38px,3.4vw,46px)] leading-none font-medium tracking-[-0.03em]">
            {formatPrice(amount)}
          </span>
          {unit ? <span className="text-[15px] text-eq-neutral-500">{unit}</span> : null}
        </div>
        <p className="mt-[10px] text-[13px] leading-[1.5] text-eq-neutral-500">{subline}</p>
      </div>
      <FeatureList items={planHighlights(plan)} className="flex-1 text-[14.5px]" />
      {ctaHref ? (
        <Button
          variant={ctaVariant ?? (highlighted ? "brand" : "neutral")}
          size="xl"
          className="w-full"
          render={<Link href={ctaHref} />}
          nativeButton={false}
        >
          {ctaLabel}
        </Button>
      ) : null}
    </Panel>
  );
}
