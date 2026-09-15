"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@base-ui/react/tabs";
import { ownerPlans, plans, TRIAL_DAYS, type BillingInterval, type Plan, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CompareTable, ownerCompareRows, providerCompareRows, type CompareRow } from "../_components/compare-table";
import { CtaPanel } from "../_components/cta-panel";
import { billingFaqs, ownerFaqs } from "../_components/faq-data";
import { FaqList } from "../_components/faq-item";
import type { FaqEntry } from "../_components/faq-item";
import { SectionHeader } from "../_components/kicker";
import { PlanCard } from "../_components/plan-card";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";
import { SegmentedControl, segmentedListClass, segmentedOptionClass } from "../_components/segmented";
import { Tag } from "../_components/tag";

// README §3 Pricing. /pricing is segmented by audience: service companies
// (Starter / Pro / Business) vs. restaurants & kitchens (Free / Kitchen /
// Multi-kitchen). Audience is URL state (`?for=owners`, so /restaurants can
// deep-link into the right tab; anything else = providers) read with
// useSearchParams, which needs a Suspense boundary on a static page — page.tsx
// renders `<PricingBody audience="providers" />` as the fallback so the
// prerendered HTML and the hydrated tree are byte-identical. The billing
// interval is plain client state, lifted here so the cards, the compare-table
// header and the price sub-labels all switch together.

export type Audience = "providers" | "owners";

type AudienceConfig = {
  plans: readonly Plan[];
  compareRows: readonly CompareRow[];
  highlightedPlanId: PlanId;
  ctaHref: (plan: Plan) => string;
  ctaLabel: (plan: Plan) => string;
  footnote: React.ReactNode;
  questionsTitle: string;
  faqs: readonly FaqEntry[];
  cta: {
    title: string;
    copy: string;
    primary: { href: string; label: string };
    secondary: { href: string; label: string };
  };
};

// Copy is verbatim from Pricing.dc.html; the trial length stays interpolated
// from plans.ts (BRIEF §3.5).
const AUDIENCES: Record<Audience, AudienceConfig> = {
  providers: {
    plans,
    compareRows: providerCompareRows,
    highlightedPlanId: "pro",
    ctaHref: (plan) => `/signup?plan=${plan.id}`,
    ctaLabel: () => "Start free trial",
    footnote: (
      <>
        Every plan starts with a {TRIAL_DAYS}-day free trial with full Pro features unlocked. No credit card to
        start. Annual billing is two months free. No overage charges at any limit.
      </>
    ),
    questionsTitle: "Billing questions.",
    faqs: billingFaqs,
    cta: {
      title: "Start on the trial. Pick the plan after.",
      copy: "Fourteen days of Pro, no card. Land on Starter, Pro, or Business when you know how many units and people you're carrying.",
      primary: { href: "/signup", label: "Start free trial" },
      secondary: { href: "/contact", label: "Talk to us" },
    },
  },
  owners: {
    plans: ownerPlans,
    compareRows: ownerCompareRows,
    highlightedPlanId: "site",
    ctaHref: (plan) => `/signup?kind=owner&plan=${plan.id}`,
    ctaLabel: (plan) => (plan.priceMonthly === 0 ? "Get started free" : "Start free trial"),
    footnote: (
      <>
        Every plan includes unlimited staff and vendor contacts. Free never expires; Kitchen and Multi-kitchen
        start with a {TRIAL_DAYS}-day free trial. Annual billing is two months free. No overage charges at any
        limit.
      </>
    ),
    questionsTitle: "Questions from restaurants and kitchens.",
    faqs: ownerFaqs,
    cta: {
      title: "Start on Free. It doesn't expire.",
      copy: "One location, ten pieces of equipment, unlimited staff. Move to Kitchen or Multi-kitchen when the walk-in count outgrows it.",
      primary: { href: "/signup?kind=owner", label: "Get started free" },
      secondary: { href: "/restaurants", label: "How it works for kitchens" },
    },
  },
};

const AUDIENCE_TABS: { value: Audience; label: string }[] = [
  { value: "providers", label: "For service companies" },
  { value: "owners", label: "For restaurants & kitchens" },
];

const INTERVAL_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly", badge: <Tag size="xs">2 months free</Tag> },
] as const;

function PlanGrid({ audience, interval }: { audience: Audience; interval: BillingInterval }) {
  const config = AUDIENCES[audience];
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-stretch gap-4">
        {config.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            interval={interval}
            ctaHref={config.ctaHref(plan)}
            ctaLabel={config.ctaLabel(plan)}
          />
        ))}
      </div>
      <p className="mt-[18px] text-[13px] leading-[1.5] text-eq-neutral-500">{config.footnote}</p>
    </>
  );
}

export type PricingBodyProps = {
  audience: Audience;
  /** Omitted by the Suspense fallback, which is never interactive. */
  onAudienceChange?: (audience: Audience) => void;
};

/**
 * Everything under the hero: controls row, plan cards, compare table,
 * questions and the CTA panel. Rendered by `AudienceTabs` with the URL
 * audience and, with the default audience, as the Suspense fallback.
 */
export function PricingBody({ audience, onAudienceChange }: PricingBodyProps) {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const config = AUDIENCES[audience];
  const intervalHeading = interval === "month" ? "Monthly, billed monthly" : "Yearly, billed annually";

  return (
    <>
      <Tabs.Root value={audience} onValueChange={(value) => onAudienceChange?.(value as Audience)}>
        <Section id="plans" aria-labelledby="plans-title" className="pt-[clamp(16px,2vw,24px)]">
          {/* Visually the controls row sits right under the hero; the heading keeps
              the outline in order (h1 → h2 → the plan-name h3s). */}
          <h2 id="plans-title" className="sr-only">
            Plans
          </h2>
          <Reveal className="flex flex-wrap items-center justify-between gap-x-6 gap-y-[14px]">
            <Tabs.List aria-label="Who the plans are for" className={segmentedListClass}>
              {AUDIENCE_TABS.map((tab) => (
                <Tabs.Tab key={tab.value} value={tab.value} className={segmentedOptionClass(tab.value === audience)}>
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <SegmentedControl
              name="interval"
              ariaLabel="Billing interval"
              value={interval}
              onChange={setInterval}
              options={INTERVAL_OPTIONS}
            />
          </Reveal>
          <Reveal className="mt-7">
            {AUDIENCE_TABS.map((tab) => (
              <Tabs.Panel key={tab.value} value={tab.value} className="outline-none">
                <PlanGrid audience={tab.value} interval={interval} />
              </Tabs.Panel>
            ))}
          </Reveal>
        </Section>
      </Tabs.Root>

      <Section id="compare" rule aria-labelledby="compare-title">
        <Reveal>
          <SectionHeader
            kicker="Compare"
            title="Every limit and feature, side by side."
            titleId="compare-title"
          />
        </Reveal>
        <Reveal className="mt-8">
          <CompareTable
            plans={config.plans}
            rows={config.compareRows}
            firstHeader={intervalHeading}
            interval={interval}
            highlightedPlanId={config.highlightedPlanId}
          />
        </Reveal>
      </Section>

      <Section id="questions" rule aria-labelledby="questions-title">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-8">
          <SectionHeader
            kicker="Questions"
            title={config.questionsTitle}
            titleId="questions-title"
            className="max-w-[400px]"
            lead={
              <>
                More about the product itself on the{" "}
                <Link
                  href="/faq"
                  className={cn(
                    "text-primary underline decoration-1 underline-offset-[3px] transition-colors duration-150",
                    "hover:text-eq-accent-300"
                  )}
                >
                  FAQ page
                </Link>
                .
              </>
            }
          />
          <FaqList items={config.faqs} />
        </Reveal>
      </Section>

      <Section variant="cta" aria-labelledby="cta-title">
        <Reveal>
          <CtaPanel
            title={config.cta.title}
            titleId="cta-title"
            primary={config.cta.primary}
            secondary={config.cta.secondary}
          >
            {config.cta.copy}
          </CtaPanel>
        </Reveal>
      </Section>
    </>
  );
}

/** Reads `?for=` from the URL and writes it back when the audience tab changes. */
export function AudienceTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const audience: Audience = searchParams.get("for") === "owners" ? "owners" : "providers";

  const setAudience = useCallback(
    (next: Audience) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "owners") {
        params.set("for", "owners");
      } else {
        params.delete("for");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return <PricingBody audience={audience} onAudienceChange={setAudience} />;
}
