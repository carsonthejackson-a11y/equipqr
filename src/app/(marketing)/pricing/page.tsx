import { Suspense } from "react";
import type { Metadata } from "next";
import { AudienceTabs, ProviderPricingSection } from "./audience-tabs";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for field-service teams and for restaurants & small business tracking their own equipment. Every plan starts with a free trial or a free tier — no overage charges.",
};

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border/80 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Pricing that scales with your route
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Every service-company plan includes a {TRIAL_DAYS}-day free trial with full Pro
            features unlocked. Restaurants & small business start on a free tier that never
            expires. No overage fees when you hit a limit — just an upgrade prompt.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        {/* AudienceTabs reads the ?for=owners|providers URL param via
            useSearchParams, which requires a Suspense boundary on a
            statically-rendered page. The fallback is byte-identical to the
            default (providers) tab's content, so there's no visible flash
            between the prerendered HTML and the hydrated client render. */}
        <Suspense fallback={<ProviderPricingSection />}>
          <AudienceTabs />
        </Suspense>
      </section>
    </>
  );
}
