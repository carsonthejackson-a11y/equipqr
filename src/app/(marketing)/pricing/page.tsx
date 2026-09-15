import { Suspense } from "react";
import type { Metadata } from "next";
import { TRIAL_DAYS } from "@/lib/plans";
import { SectionHeader } from "../_components/kicker";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";
import { AudienceTabs, PricingBody } from "./audience-tabs";

const lead = `Every service-company plan starts with a ${TRIAL_DAYS}-day free trial with full Pro features unlocked. Restaurants and kitchens start on a free tier that never expires. Hit a limit and you get an upgrade prompt, not an overage fee.`;

export const metadata: Metadata = {
  title: "Pricing",
  description: lead,
};

export default function PricingPage() {
  return (
    <>
      <Section variant="hero" aria-labelledby="page-title" className="pb-[clamp(24px,3vw,40px)]">
        <Reveal>
          <SectionHeader
            size="h1"
            kicker="Pricing"
            title="Pricing that scales with your route."
            titleId="page-title"
            lead={lead}
            className="max-w-[760px]"
            leadClassName="max-w-[56ch]"
          />
        </Reveal>
      </Section>

      {/* AudienceTabs reads the ?for=owners|providers URL param via
          useSearchParams, which requires a Suspense boundary on a
          statically-rendered page. The fallback is byte-identical to the
          default (providers) audience, so there's no visible flash between
          the prerendered HTML and the hydrated client render. */}
      <Suspense fallback={<PricingBody audience="providers" />}>
        <AudienceTabs />
      </Suspense>
    </>
  );
}
