import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin, MessageSquare, Phone, Scan, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ownerPlans } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CtaPanel } from "../_components/cta-panel";
import {
  DashboardCard,
  DashboardHeader,
  DashboardLocationRow,
  DashboardProgress,
  DashboardSectionLabel,
  DashboardVendorCard,
  DashboardVendorGrid,
} from "../_components/dashboard-mock";
import { ownerFaqs } from "../_components/faq-data";
import { FaqList } from "../_components/faq-item";
import { GhostLink } from "../_components/ghost-link";
import { Icon } from "../_components/icon";
import { IconRow } from "../_components/icon-row";
import { headingClass, Kicker, SectionHeader } from "../_components/kicker";
import {
  PhoneCard,
  PhoneCheckCircle,
  PhoneChips,
  PhoneFrame,
  PhoneHeader,
  PhoneNote,
  PhonePhotoRow,
  PhonePrimary,
  PhoneQuestion,
  PhoneTitle,
  PhoneUrgency,
} from "../_components/phone-mock";
import { PlanCard } from "../_components/plan-card";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";
import { StepCard } from "../_components/step-card";
import { Tag } from "../_components/tag";
import { TimelineCard } from "../_components/timeline-card";

// docs/design/marketing-2026-09/Restaurants.dc.html → README "Screens → 4.
// Restaurants". Copy is verbatim from the design file. Copy rules from
// docs/OWNER-ROADMAP-BRIEF.md §3.4.2 still apply: no fabricated customers,
// logos, testimonials, or numbers beyond the one attributed stat below. The
// "Sunrise Diner" / "Metro Refrigeration" names in the mocks are illustrative
// placeholder content (same convention as phone-mock.tsx), not a claimed real
// customer.
export const metadata: Metadata = {
  title: "For Restaurants & Kitchens",
  description:
    "Put a QR sticker on every machine in the building. When something breaks, whoever's standing there scans it, taps what's wrong, and it goes straight to the vendor who services it. No app, no manager on shift, no guessing who to call.",
};

// Design flags (`data-props` at the bottom of Restaurants.dc.html). BRIEF D7:
// the MachineQ stat stays on because it carries a source line; the plans
// teaser reads `ownerPlans` so it never drifts from pricing.
const showStat = true;
const showPricingTeaser = true;

const SIGNUP_HREF = "/signup?kind=owner";

// The owner mock's plan tag reads the multi-location plan's display name from
// plans.ts (BRIEF D4 renames it to "Multi-kitchen"); never hard-code plan names.
const multiLocationPlanName = ownerPlans.find((plan) => plan.id === "multi_site")?.name ?? "";

const steps = [
  {
    number: "01",
    title: "Tag it",
    copy: "Put a QR sticker on every piece of equipment when you set it up: the dish machine, the walk-in, the fryer, the POS terminal.",
  },
  {
    number: "02",
    title: "Staff scans it",
    copy: "Something's wrong? Any cook, server, or dishwasher scans the tag with their phone camera. No app to install, no account to make.",
  },
  {
    number: "03",
    title: "They tap what's happening",
    copy: "Symptom chips built for restaurant equipment (“Not draining,” “Not heating,” “Error code”), plus an optional photo and how urgent it is.",
  },
  {
    number: "04",
    title: "It goes straight to your vendor",
    copy: "EquipQR emails the vendor on file for that unit, or you if none is set, with the phone number handed right back to whoever reported it.",
  },
] as const;

const ownerRows = [
  {
    icon: MapPin,
    title: "Every location, one dashboard",
    copy: "Locations, the equipment at each one, and who's supposed to service it, whether you run one kitchen or five.",
  },
  {
    icon: Truck,
    title: "Vendor contact cards",
    copy: "Save each vendor once (email, phone, SLA) and set one as the default for a whole category, like refrigeration. Every unit picks a vendor without you doing it by hand.",
  },
  {
    icon: MessageSquare,
    title: "Work orders with dispatch status",
    copy: "See when a vendor opened the email, acknowledged it, gave an ETA, or finished, right on the request, without calling to check.",
  },
  {
    icon: ShieldCheck,
    title: "A free tier you're never locked out of",
    copy: "Start on Free: one location, 10 units, no credit card. If you outgrow it, upgrade; if you don't, you keep working either way.",
  },
] as const;

const timelineRows = [
  {
    time: "7:40 pm",
    title: "Stops draining mid-rush",
    detail: "Manager who knows the vendor isn't on shift.",
  },
  {
    time: "7:41 pm",
    title: "Dishwasher scans the tag, taps “Not draining”",
    detail: "Photo attached · Can't operate without it",
  },
  {
    time: "7:41 pm",
    title: "Sent to Metro Refrigeration",
    detail: "Vendor on file for this unit. Manager copied by email; vendor's number handed to the dishwasher.",
  },
] as const;

const workOrderSteps = [
  { label: "Sent", time: "7:41 pm", done: true },
  { label: "Opened", time: "7:44 pm", done: true },
  { label: "Ack'd", time: "7:52 pm", done: true },
  { label: "ETA", time: "—" },
  { label: "Finished", time: "—" },
] as const;

// Two-column section grid shared by the story, staff and owner sections.
const twoColClass =
  "grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-x-[clamp(32px,5vw,80px)]";

// Sub-section H2 (staff/owner view) is clamp(26px, 3vw, 36px) in this design.
const subHeadingClass = cn(headingClass["h2-sub"], "text-[clamp(26px,3vw,36px)]");

export default function RestaurantsPage() {
  return (
    <>
      {/* Hero */}
      <Section
        variant="hero"
        aria-labelledby="page-title"
        containerClassName={cn(twoColClass, "gap-y-12")}
      >
        <Reveal>
          <SectionHeader
            kicker="For restaurants & kitchens"
            title="Tag the kitchen. Any cook can send the right vendor a work order."
            titleId="page-title"
            size="h1"
            lead="Put a QR sticker on every machine in the building. When something breaks, whoever's standing there scans it, taps what's wrong, and it goes straight to the vendor who services it. No app, no manager on shift, no guessing who to call."
            leadClassName="max-w-[54ch]"
          >
            <div className="flex flex-wrap gap-3 pt-3">
              <Button variant="brand" size="xl" className="h-[46px] px-5" render={<Link href={SIGNUP_HREF} />}>
                Start free
                <Icon icon={ArrowRight} size={16} data-icon="inline-end" />
              </Button>
              <Button variant="neutral" size="xl" className="h-[46px] px-5" render={<Link href="#how-it-works" />}>
                See how it works
              </Button>
            </div>
            <p className="mt-4 text-[13.5px] leading-[1.5] text-eq-neutral-500">
              Free forever for one location · no credit card
            </p>
          </SectionHeader>
        </Reveal>
        <div className="flex justify-center py-3">
          <PhoneFrame rotate={2} delayMs={120} gap={9}>
            <PhoneHeader kicker="Sunrise Diner" title="Ice machine" subtitle="Back kitchen" />
            <PhoneQuestion>What&apos;s happening?</PhoneQuestion>
            <PhoneChips
              items={["Not making ice", "Ice tastes bad", "Bin not filling", "Won't start"]}
              selectedIndex={0}
            />
            <PhonePhotoRow label="Add a photo (optional)" />
            <PhoneUrgency label="We can't operate without this" />
            <PhonePrimary label="Send work order" />
          </PhoneFrame>
        </div>
      </Section>

      {/* The moment it's for */}
      <Section rule aria-labelledby="story-title">
        <Reveal className={cn(twoColClass, "gap-y-8")}>
          <div>
            <Kicker className="mb-[14px]">The moment it&apos;s for</Kicker>
            <h2 id="story-title" className={headingClass["h2-story"]}>
              It&apos;s 7:40 pm on a Friday.
            </h2>
            <p className="mt-5 max-w-[54ch] text-[16.5px] leading-[1.65] text-eq-neutral-400">
              The dish machine stops draining mid-rush. The manager who knows which repair company
              handles it isn&apos;t on shift. Nobody can find the invoice with the vendor&apos;s
              number on it. Someone starts scrolling through old texts, or worse, calls around the
              industry hoping someone answers this late.
            </p>
            <p className="mt-[14px] max-w-[54ch] text-[16.5px] leading-[1.65] text-eq-neutral-400">
              With a QR tag on the machine, that same moment looks different: a dishwasher scans
              the sticker, taps &ldquo;Not draining,&rdquo; and it&apos;s sent to the vendor on
              file for that unit, with the manager copied by email. No lookup, no group text, no
              waiting for someone with the right phone number to show up.
            </p>
          </div>
          <TimelineCard
            title="Dish machine · Back kitchen"
            subtitle="Sunrise Diner · Friday"
            tag="Sent"
            rows={timelineRows}
            note="No lookup, no group text, no waiting for the right phone."
          />
        </Reveal>
        {showStat ? (
          <Reveal className="mt-[clamp(40px,5vw,64px)] flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-eq-neutral-900 bg-eq-surface px-[clamp(20px,3vw,32px)] py-[clamp(20px,3vw,28px)]">
            <span className="text-[clamp(44px,5vw,64px)] leading-none font-medium tracking-[-0.035em] text-primary tabular-nums">
              49%
            </span>
            <div className="flex-[1_1_320px]">
              <p className="max-w-[60ch] text-[16px] leading-[1.55] text-eq-neutral-200">
                In MachineQ&apos;s 2026 survey of restaurant operators, 49% said equipment failure
                or unplanned maintenance had caused downtime.
              </p>
              <p className="mt-[6px] text-[12.5px] text-eq-neutral-500">
                MachineQ 2026 restaurant equipment report, via restaurantnews.com
              </p>
            </div>
          </Reveal>
        ) : null}
      </Section>

      {/* How it works */}
      <Section id="how-it-works" rule aria-labelledby="how-title">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-end gap-x-[clamp(32px,5vw,80px)] gap-y-5">
          <div>
            <Kicker className="mb-[14px]">How it works</Kicker>
            <h2 id="how-title" className={headingClass["h2-story"]}>
              Four steps, no phone tree.
            </h2>
          </div>
          <p className="max-w-[48ch] text-[16.5px] leading-[1.6] text-eq-neutral-400">
            Nobody on shift needs to know who the vendor is. The tag already does.
          </p>
        </Reveal>
        <Reveal className="mt-[clamp(32px,4vw,48px)] grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
          {steps.map((step) => (
            <StepCard key={step.number} number={step.number} title={step.title}>
              {step.copy}
            </StepCard>
          ))}
        </Reveal>
      </Section>

      {/* What staff see */}
      <Section rule aria-labelledby="staff-title">
        <Reveal className={cn(twoColClass, "gap-y-10")}>
          <div>
            <div className="flex items-center gap-3">
              <Icon icon={Scan} size={24} className="text-primary" />
              <h2 id="staff-title" className={subHeadingClass}>
                What staff see
              </h2>
            </div>
            <p className="mt-[18px] max-w-[52ch] text-[16px] leading-[1.65] text-eq-neutral-400">
              A phone camera and a few taps. Pick what&apos;s wrong from chips built for restaurant
              equipment, add a photo if it helps, and say how urgent it is, from &ldquo;whenever
              they&apos;re next nearby&rdquo; up to &ldquo;we can&apos;t operate without
              this.&rdquo;
            </p>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.65] text-eq-neutral-400">
              The confirmation screen names the vendor and hands over their phone number right
              there, in case it can&apos;t wait for an email reply.
            </p>
          </div>
          <div className="flex min-w-0 items-start justify-center gap-[18px] py-4">
            <PhoneFrame rotate={-3} className="translate-y-[18px]">
              <PhoneHeader kicker="Sunrise Diner" title="Walk-in cooler" subtitle="Dry storage" />
              <PhoneQuestion>What&apos;s happening?</PhoneQuestion>
              <PhoneChips
                items={["Not cold enough", "Door won't seal", "Frost build-up", "Loud noise"]}
                selectedIndex={2}
              />
              <PhonePhotoRow label="1 photo added" />
              <PhoneUrgency label="Whenever they're next nearby" />
              <PhonePrimary label="Send work order" />
            </PhoneFrame>
            <PhoneFrame rotate={3} className="max-[1100px]:hidden">
              <PhoneCheckCircle />
              <PhoneTitle>Sent to Metro Refrigeration</PhoneTitle>
              <PhoneNote>Sunrise Diner was notified too. Metro usually responds within 2 hours.</PhoneNote>
              <PhoneCard title="Work order #1043">
                Walk-in cooler · Dry storage · Frost build-up · 1 photo · 7:41 pm
              </PhoneCard>
              <PhonePrimary label="Call Metro Refrigeration" icon={Phone} />
            </PhoneFrame>
          </div>
        </Reveal>
      </Section>

      {/* What you see (owner) */}
      <Section rule aria-labelledby="owner-title">
        <Reveal className={cn(twoColClass, "gap-y-10")}>
          {/* `data-visual-left`: mock first on desktop, under the copy once the
              grid stacks. With 340px columns and the fluid gutters the auto-fit
              grid stacks below 800px, so the reorder uses the same point (the
              design's 760px media query would leave the mock on top for a few
              pixels in between). */}
          <div className="order-first min-w-0 max-[800px]:order-2">
            <DashboardCard>
              <DashboardHeader
                title="Sunrise Diner"
                meta="2 locations · 23 units · 1 open work order"
                tag={<Tag variant="outline">{multiLocationPlanName}</Tag>}
              />
              <div className="flex flex-col gap-[6px]">
                <DashboardLocationRow
                  name="Downtown"
                  meta={
                    <>
                      14 units · <span className="text-primary">1 open</span>
                    </>
                  }
                />
                <DashboardLocationRow name="Airport Rd" meta="9 units · All clear" />
              </div>
              <div>
                <DashboardSectionLabel className="mb-2">Vendors</DashboardSectionLabel>
                <DashboardVendorGrid>
                  <DashboardVendorCard title="Metro Refrigeration">
                    Default for Refrigeration · responds within 2 h · (214) 555-0142
                  </DashboardVendorCard>
                  <DashboardVendorCard title="Cooking · no vendor yet" empty>
                    Reports come to you by email until one is set.
                  </DashboardVendorCard>
                </DashboardVendorGrid>
              </div>
              <DashboardProgress
                title="Work order #1043 · Ice machine · Downtown"
                tag={<Tag>Acknowledged</Tag>}
                steps={workOrderSteps}
              />
            </DashboardCard>
          </div>
          <div>
            <Kicker className="mb-[14px]">For the owner</Kicker>
            <h2 id="owner-title" className={subHeadingClass}>
              What you see
            </h2>
            <p className="mt-[14px] max-w-[50ch] text-[16px] leading-[1.6] text-eq-neutral-400">
              Every location, every unit, and every work order, without living in a group text.
            </p>
            <div className="mt-7 flex flex-col gap-[22px]">
              {ownerRows.map((row) => (
                <IconRow key={row.title} icon={row.icon} title={row.title}>
                  {row.copy}
                </IconRow>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* Plans teaser */}
      {showPricingTeaser ? (
        <Section rule aria-labelledby="plans-title">
          <Reveal className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <SectionHeader
              kicker="Plans"
              title="Free to start, simple to grow into."
              titleId="plans-title"
              lead="One location and 10 units, free, forever. Upgrade when you need more, never because your trial ran out."
              leadClassName="mt-[14px] max-w-[50ch]"
            />
            <GhostLink href="/pricing?for=owners">Compare all plan details</GhostLink>
          </Reveal>
          <Reveal className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
            {ownerPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} interval="month" compact />
            ))}
          </Reveal>
          <p className="mt-[14px] text-[13px] leading-[1.5] text-eq-neutral-500">
            Every plan includes unlimited staff and vendor contacts. Annual billing is two months
            free. No overage charges at any limit.
          </p>
        </Section>
      ) : null}

      {/* Questions */}
      <Section rule aria-labelledby="faq-title">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-8">
          <div className="max-w-[400px]">
            <Kicker className="mb-[14px]">Questions</Kicker>
            <h2 id="faq-title" className={headingClass.h2}>
              Questions from restaurants and kitchens.
            </h2>
            <p className="mt-4 text-[16px] leading-[1.6] text-eq-neutral-400">
              Billing questions are on the{" "}
              <Link
                href="/pricing?for=owners"
                className="text-eq-accent-300 underline underline-offset-[3px] transition-colors duration-150 hover:text-eq-accent-200"
              >
                pricing page
              </Link>
              .
            </p>
          </div>
          <FaqList items={ownerFaqs} />
        </Reveal>
      </Section>

      {/* Final CTA */}
      <Section variant="cta" aria-labelledby="cta-title">
        <Reveal>
          <CtaPanel
            title="Put a tag on your first machine today."
            titleId="cta-title"
            primary={{ href: SIGNUP_HREF, label: "Start free" }}
            secondary={{ href: "/contact", label: "Talk to us first" }}
          >
            Free for one location, no credit card. Add your equipment and vendors in minutes.
          </CtaPanel>
        </Reveal>
      </Section>
    </>
  );
}
