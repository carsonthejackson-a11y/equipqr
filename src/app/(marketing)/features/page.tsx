import Link from "next/link";
import type { Metadata } from "next";
import {
  Calendar,
  Camera,
  ClipboardList,
  Code,
  History,
  ListChecks,
  MessageSquare,
  Printer,
  Route,
  Scan,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { CtaPanel } from "../_components/cta-panel";
import { FeatureList } from "../_components/feature-list";
import { FeatureRow } from "../_components/feature-row";
import { GhostLink } from "../_components/ghost-link";
import { CheckIcon, Icon } from "../_components/icon";
import { JumpNav } from "../_components/jump-nav";
import { Kicker, SectionHeader, headingClass } from "../_components/kicker";
import { Panel } from "../_components/panel";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";
import { TagMiniMock, TagMock, TagStripMock } from "../_components/tag-mock";
import {
  AssistantMock,
  BatchMock,
  BrandingMock,
  GuideMock,
  HistoryMock,
  RequestEmailMock,
  RoutingMock,
} from "./mocks";
import { PlansMatrix } from "./plans-matrix";

// docs/design/marketing-2026-09/Features.dc.html → README §"2. Features".
// Copy is verbatim from the design file.

export const metadata: Metadata = {
  title: "Features",
  description:
    "One sticker, one page, and a dashboard that turns every scan into either a resolved machine or a request that's ready to act on. Grouped by what changes for you, not by menu.",
};

/** Header (64px) + sticky jump nav (60px) so anchors land with the heading visible. */
const anchorClass = "scroll-mt-[124px]";
/** Outcome sections open with the hero's top rhythm in the design. */
const outcomeSectionClass = cn(anchorClass, "pt-[clamp(56px,7vw,104px)]");
/** Feature-row H3s on this page are larger than the README default (WS3 note). */
const rowTitleClass = "text-[clamp(22px,2vw,26px)] leading-[1.2] tracking-[-0.015em]";
const rowGap = "mt-[clamp(40px,5vw,64px)]";

const jumpItems = [
  { href: "#resolution", number: "01", label: "Faster resolution" },
  { href: "#truck-rolls", number: "02", label: "Fewer truck rolls" },
  { href: "#presence", number: "03", label: "A more professional presence" },
] as const;

/** Kicker + H2 on the left, the 16.5px intro on the right, aligned to the baseline. */
function OutcomeHeader({
  number,
  title,
  titleId,
  children,
}: {
  number: string;
  title: string;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-end gap-x-[clamp(32px,5vw,80px)] gap-y-5">
      <div>
        <Kicker className="mb-[14px]">Outcome {number}</Kicker>
        <h2 id={titleId} className={headingClass["h2-outcome"]}>
          {title}
        </h2>
      </div>
      <p className="max-w-[52ch] text-[16.5px] leading-[1.6] text-eq-neutral-400">{children}</p>
    </Reveal>
  );
}

/** The two-up cards under an outcome (`data-two` in the design). */
function InfoCard({ icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <Panel className="flex flex-col gap-[14px] transition-[border-color,transform] duration-200 hover:-translate-y-0.5">
      <Icon icon={icon} size={24} className="text-primary" />
      <h3 className={headingClass.h3}>{title}</h3>
      <p className="text-[15px] leading-[1.6] text-eq-neutral-400">{children}</p>
    </Panel>
  );
}

const twoUpClass = cn(rowGap, "grid grid-cols-2 gap-4 max-[560px]:grid-cols-1");

const stickerLayouts = [
  {
    mock: <TagMock company="Metro Refrigeration" unit="Dish machine · Unit 3" />,
    name: "2 × 2 in · Square",
    note: "The default. Door panels, control housings — largest QR, scans from across the line.",
  },
  {
    mock: <TagStripMock company="Metro Refrigeration" unit="Ice machine · Bar" />,
    name: "3 × 2 in · Wide",
    note: "The most room for your name and contact line, for units customers call about directly.",
  },
  {
    mock: <TagMiniMock />,
    name: "1 × 1 in · Minimal",
    note: "QR and short code only, for parts and trim too small for anything else.",
  },
];

const stickerFacts = [
  "Every size fits standard label sheets for self-printing",
  "Layout set per equipment type, or per unit",
  "We recommend weatherproof label stock for kitchens and wash-down areas",
  "Print instantly — no ordering, no lead time",
];

export default function FeaturesPage() {
  return (
    <>
      <Section variant="hero" aria-labelledby="page-title" className="pb-[clamp(24px,3vw,40px)]">
        <Reveal>
          <SectionHeader
            kicker="Features"
            size="h1"
            title="Everything between a scan and a fixed unit."
            titleId="page-title"
            lead={
              "One sticker, one page, and a dashboard that turns every scan into either a resolved machine or a request that's ready to act on. Grouped by what changes for you, not by menu."
            }
            className="max-w-[760px]"
            leadClassName="max-w-[56ch]"
          />
        </Reveal>
      </Section>

      <JumpNav
        label="Outcomes"
        ariaLabel="Outcomes"
        items={jumpItems}
        aside={{ href: "#plans", label: "What's on which plan" }}
      />

      {/* Outcome 01 */}
      <Section id="resolution" aria-labelledby="o1-title" className={outcomeSectionClass}>
        <OutcomeHeader number="01" title="Faster resolution" titleId="o1-title">
          {
            "Most equipment problems in a kitchen are a handful of known causes. The guide walks whoever is standing at the machine through them in the order that usually works. When it isn't one of them, the request is already on its way to the right person."
          }
        </OutcomeHeader>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={ListChecks}
            title="Guides that draft themselves"
            titleClassName={rowTitleClass}
            visual={<GuideMock />}
          >
            <p>
              Describe an equipment type and its common failure modes once. EquipQR drafts a full branching
              troubleshooting guide in minutes: a question at every step, a clear outcome at every branch. Fixed, keep
              going, or request service.
            </p>
            <p>
              Edit any step before you publish. Every unit of that equipment type uses the same guide from then on, so
              a fix you learn on one dish machine reaches all of them.
            </p>
            <FeatureList
              className="mt-2 text-[14.5px]"
              items={[
                'Photos on any step, so "the drain screen" means the right part',
                "Every answer chosen is recorded on the unit and carried into the request",
                "Included on every plan with guides; restaurant Free tier takes requests only",
              ]}
            />
          </FeatureRow>
        </Reveal>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={MessageSquare}
            title="An assistant for what the script missed"
            titleClassName={rowTitleClass}
            availability="Pro and above · Kitchen and above"
            visual={<AssistantMock />}
            visualLeft
          >
            <p>
              {
                "When the question isn't covered by the steps, the person at the machine asks in plain language and gets an answer that knows which equipment type they're looking at and where they are in the guide."
              }
            </p>
            <p>
              It never replaces the request button. It sits next to it, and what was discussed goes into the summary
              your team receives.
            </p>
          </FeatureRow>
        </Reveal>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={Route}
            title={"Routing that doesn't need a dispatcher"}
            titleClassName={rowTitleClass}
            visual={<RoutingMock />}
          >
            <p>
              {
                "For restaurants and kitchens: staff pick a symptom built for the equipment (Not draining, Not heating, Error code), add a photo, and say how urgent it is. The work order goes to the vendor on file for that unit, or to the owner if none is set. The vendor's phone number is handed back to whoever reported it."
              }
            </p>
            <p>
              Save each vendor once with email, phone, and typical response window, and set a default per category like
              refrigeration. New units pick their vendor automatically.
            </p>
          </FeatureRow>
        </Reveal>
      </Section>

      {/* Outcome 02 */}
      <Section id="truck-rolls" aria-labelledby="o2-title" rule className={outcomeSectionClass}>
        <OutcomeHeader number="02" title="Fewer truck rolls" titleId="o2-title">
          A trip that ends at a reset button costs the same as one that replaces a compressor. EquipQR takes the first
          kind off the schedule, and makes the second kind land right on the first visit.
        </OutcomeHeader>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={Camera}
            title="Requests that arrive dispatch-ready"
            titleClassName={rowTitleClass}
            visual={<RequestEmailMock />}
          >
            <p>
              {
                "When the guide doesn't fix it, the request is filed in the same flow: what's happening, contact details, photos or a short video, and how urgent it is. All from the phone that scanned the tag."
              }
            </p>
            <p>
              {
                "You get an email the moment it's submitted, with an AI-written summary of what they already tried and what they saw. No more \"it's just not working\" voicemail. Whoever picks it up knows what to bring before leaving the shop."
              }
            </p>
          </FeatureRow>
        </Reveal>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={History}
            title="A history on every unit"
            titleClassName={rowTitleClass}
            visual={<HistoryMock />}
            visualLeft
          >
            <p>
              Guides completed, requests filed, inspections walked, visits scheduled: all tied to the specific machine,
              its location, and the customer. The next tech sees what was tried last time before knocking on the door.
            </p>
            <p>
              Filter and search across every site from the dashboard. Business plans can export it all or pull it
              through the API.
            </p>
          </FeatureRow>
        </Reveal>

        <Reveal className={twoUpClass}>
          <InfoCard icon={Calendar} title="Maintenance before the failure">
            Recurring service lives on a schedule per unit, with a schedule view across every site. Inspection
            checklists are walked from the tag, so results land on the equipment record instead of a clipboard in the
            truck.
          </InfoCard>
          <InfoCard icon={ClipboardList} title="Records that keep up with the route">
            Custom fields for what you track: filter size, refrigerant, warranty end. Bulk import from a spreadsheet.
            Equipment types with their own guides, checklists, and default vendors.
          </InfoCard>
        </Reveal>
      </Section>

      {/* Outcome 03 */}
      <Section id="presence" aria-labelledby="o3-title" rule className={outcomeSectionClass}>
        <OutcomeHeader number="03" title="A more professional on-site presence" titleId="o3-title">
          The sticker on the machine is the most-seen piece of marketing a service company has. It should carry your
          name, work every time, and open a page that looks like you.
        </OutcomeHeader>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={ShieldCheck}
            title="Your name on the machine"
            titleClassName={rowTitleClass}
            availability="Pro and above · Multi-kitchen"
            visual={<BrandingMock />}
          >
            <p>
              Tags and customer pages carry your logo and colors. The sticker says who to call, the page it opens looks
              like your company, and EquipQR stays in the background.
            </p>
            <p>
              {
                "On the Starter plan and the restaurant Free and Kitchen tiers, tags and pages ship in EquipQR's own look, with your company name and contact on every one."
              }
            </p>
          </FeatureRow>
        </Reveal>

        <Reveal className={rowGap}>
          <FeatureRow
            icon={Printer}
            title="Stickers, printed your way"
            titleClassName={rowTitleClass}
            visual={<BatchMock />}
            visualLeft
          >
            <p>
              Download a print-ready SVG or PNG the moment you add a unit, or print a batch of blank codes on a standard
              label sheet before a route. Pro and above can generate and print batches ahead of time.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-eq-text">
              <Icon icon={Scan} size={24} className="text-primary" />
              <h3 className={cn(headingClass["h3-row"], rowTitleClass)}>Tag first, claim on-site</h3>
            </div>
            <p>
              {
                "Stick a blank code on the unit, scan it while signed in, photograph the nameplate, and the equipment record is created with make, model, and serial filled in. Until it's claimed, customers who scan see a plain \"not set up yet, contact the service company\" message. Never a dead link."
              }
            </p>
          </FeatureRow>
        </Reveal>

        <Reveal className={rowGap}>
          <Panel as="section" padding="none" hover={false} className="p-[clamp(24px,3vw,36px)]" aria-labelledby="sizes-title">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div className="max-w-[560px]">
                <Kicker className="mb-[10px]">Sticker sizes</Kicker>
                <h3 id="sizes-title" className={cn(headingClass["h3-row"], rowTitleClass)}>
                  Three sizes to print yourself. Pick per equipment type.
                </h3>
                <p className="mt-3 text-[15px] leading-[1.6] text-eq-neutral-400">
                  {
                    "A 2 × 2 in square for door panels and control housings, a 3 × 2 in size with more room for your name and number, and a 1 × 1 in minimal size for small parts and trim. Print any of them yourself, at true size, straight from the equipment page — no ordering, no waiting."
                  }
                </p>
              </div>
              <span className="text-[12.5px] text-eq-neutral-500">Shown at roughly 60% of print size</span>
            </div>
            <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(176px,1fr))] items-end gap-6">
              {stickerLayouts.map((layout) => (
                <div key={layout.name} className="flex flex-col gap-3">
                  {layout.mock}
                  <div className="flex flex-col gap-[2px]">
                    <span className="text-[13px] font-medium">{layout.name}</span>
                    <span className="max-w-[176px] text-[12px] leading-[1.4] text-eq-neutral-500">{layout.note}</span>
                  </div>
                </div>
              ))}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-eq-neutral-900 pt-4 text-[13px] text-eq-neutral-400">
              {stickerFacts.map((fact) => (
                <li key={fact} className="flex items-center gap-2">
                  <CheckIcon size={16} className="size-[14px] text-primary" />
                  {fact}
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>

        <Reveal className={twoUpClass}>
          <InfoCard icon={Users} title="A crew-shaped account">
            Owners handle billing, team, and settings. Technicians work equipment, customers, and requests without
            touching the money. Add a technician in seconds when the crew grows. Restaurant plans include unlimited
            staff and vendor contacts.
          </InfoCard>
          <InfoCard icon={Code} title="Isolated by design, open on request">
            {
              "Every company's equipment, customers, and requests are walled off at the database level; there's no shared table a bug could leak across accounts. Business plans add data export and API access with scoped keys. "
            }
            <Link
              href="/security"
              className="text-eq-accent-300 underline underline-offset-[3px] transition-colors duration-150 hover:text-primary"
            >
              How security works
            </Link>
            .
          </InfoCard>
        </Reveal>
      </Section>

      {/* Plans */}
      <Section id="plans" aria-labelledby="plans-title" rule className={outcomeSectionClass}>
        <Reveal className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <SectionHeader kicker="Plans" title="What's on which plan." titleId="plans-title" />
          <GhostLink href="/pricing">Full pricing</GhostLink>
        </Reveal>
        <Reveal className="mt-8">
          <PlansMatrix />
        </Reveal>
        <p className="mt-[14px] text-[13px] leading-[1.5] text-eq-neutral-500">
          Service-company plans start with a {TRIAL_DAYS}-day trial of Pro, no card required. Restaurant plans start
          on Free, which never expires. Annual billing is two months free. No overage charges at any limit.
        </p>
      </Section>

      <Section variant="cta" aria-labelledby="cta-title">
        <Reveal>
          <CtaPanel
            title="Ready to put a sticker on your first unit?"
            titleId="cta-title"
            primary={{ href: "/signup", label: "Start free trial" }}
            secondary={{ href: "/pricing", label: "See pricing" }}
          >
            Every feature on this page is in the {TRIAL_DAYS}-day trial. Set up one equipment type, print one code, and
            scan it yourself.
          </CtaPanel>
        </Reveal>
      </Section>
    </>
  );
}
