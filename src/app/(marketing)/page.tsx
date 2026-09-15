import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  ClipboardList,
  Code,
  History,
  Mail,
  Printer,
  Scan,
  ShieldCheck,
  Split,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from "@/lib/site";
import { TRIAL_DAYS } from "@/lib/plans";
import { Section } from "./_components/section";
import { SectionHeader, Kicker, headingClass, leadClass } from "./_components/kicker";
import { Reveal } from "./_components/reveal";
import { Tag } from "./_components/tag";
import { Panel } from "./_components/panel";
import { FeatureList } from "./_components/feature-list";
import { IconRow } from "./_components/icon-row";
import { GhostLink } from "./_components/ghost-link";
import { CtaPanel } from "./_components/cta-panel";
import { FaqList } from "./_components/faq-item";
import type { FaqEntry } from "./_components/faq-item";
import { CheckIcon, Icon } from "./_components/icon";
import {
  PhoneFrame,
  PhoneHeader,
  PhonePrompt,
  PhoneOptions,
  PhoneInputRow,
  PhoneCheckCircle,
  PhoneTitle,
  PhoneNote,
  PhoneCard,
  PhonePhotoGrid,
  PhonePrimary,
} from "./_components/phone-mock";
import {
  DashboardFrame,
  DashboardSidebar,
  DashboardToolbar,
  DashboardStats,
  DashboardStat,
  DashboardTable,
  DashboardRow,
} from "./_components/dashboard-mock";
import { TagMock } from "./_components/tag-mock";
import { productFaqs, ownerFaqs } from "./_components/faq-data";

// Home (docs/design/marketing-2026-09/Home.dc.html, README "1. Home").
// Sections in the design's order; copy is verbatim from the design file with
// `TRIAL_DAYS` interpolated where the old page did (BRIEF §3.5).

/**
 * Social-proof band (README §1.2) and the customer quote (§1.10) are
 * placeholder slots until real logos / a real quote exist (BRIEF D7). Flip
 * this to render the band; the quote section still needs its copy.
 */
const showSocialProof = false;

const heroTitle = "Scan the tag. Fix it, or file the request.";
const heroLead =
  "EquipQR puts a QR tag on every piece of commercial kitchen equipment. Whoever scans it gets a troubleshooting guide for that exact machine. If that doesn't fix it, one tap sends a service request with photos to whoever services the unit. No app, no login.";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${heroTitle}` },
  description:
    "EquipQR puts a QR tag on every piece of commercial kitchen equipment. Whoever scans it gets a troubleshooting guide for that exact machine, or one tap sends a service request with photos to whoever services the unit. No app, no login.",
  openGraph: {
    title: `${SITE_NAME} — ${heroTitle}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "29",
    priceCurrency: "USD",
    category: "SaaS subscription",
  },
};

// ------------------------------------------------------------------ data ---

const heroPoints = [
  "No app to install, any phone camera",
  `${TRIAL_DAYS}-day trial with full Pro, no card`,
  "Restaurants: free for one location",
  "Built by a working repair tech",
];

const facts = [
  { value: "3 taps", label: "from a scan to a sent request: scan, tap what's wrong, send" },
  { value: "0 apps", label: "to install, for customers, kitchen staff, or your own techs" },
  { value: `${TRIAL_DAYS} days`, label: "of full Pro features on every service-company trial, no card" },
  { value: "10 units", label: "tracked free, forever, for a single-location restaurant" },
];

const benefits = [
  {
    icon: Truck,
    title: "Fewer wasted trips",
    copy: "Customers try the two or three things that fix most calls before anyone drives out. When a truck does roll, the tech already knows what was tried and what to bring.",
  },
  {
    icon: Split,
    title: "No dispatcher required",
    copy: "Kitchen staff route their own requests. The tag knows which vendor services that unit, the work order goes straight there, and the manager is copied.",
  },
  {
    icon: Scan,
    title: "Tag before you know the unit",
    copy: "Print a batch of blank codes ahead of a route. On-site, scan one, photograph the nameplate, and the unit is created with make, model, and serial filled in.",
  },
  {
    icon: History,
    title: "A history on every unit",
    copy: "Every scan, guide, request, inspection, and scheduled visit is tied to the equipment, its location, and the customer. Searchable from the dashboard; exportable on Business.",
  },
  {
    icon: Calendar,
    title: "Maintenance on a schedule",
    copy: "Recurring service and inspection checklists live on the unit. A tech walks the checklist from the tag; the results stay with the equipment.",
  },
  {
    icon: ShieldCheck,
    title: "Your name on the machine",
    copy: "On Pro and above, tags and customer pages carry your logo and colors. The sticker on the fryer says who to call, and the page it opens looks like you.",
  },
];

const providerPoints = [
  "Pre-printed sticker batches: tag first, then claim the unit on-site by photographing the nameplate.",
  "Requests arrive with photos, video, urgency, and an AI summary of what the customer already tried.",
  "Customer and equipment records per site, with custom fields, bulk import, and label printing.",
  "Owners run billing and settings; technicians work equipment and requests. Data never crosses between companies.",
];

const ownerPoints = [
  "Save each vendor once, with email, phone, and response window. Set a default per category, like refrigeration.",
  "Staff tap what's wrong: Not draining, Not heating, Error code. Add a photo and how urgent it is, and it's sent.",
  "See when the vendor opened it, acknowledged it, gave an ETA, or finished, without calling to check.",
  "No vendor on file yet? The report is still filed and you're emailed, so nothing is silently dropped.",
];

const capabilities = [
  {
    icon: ClipboardList,
    title: "Equipment records",
    copy: "Make, model, serial, photos, and the custom fields you define. Bulk import from a spreadsheet.",
  },
  {
    icon: Building2,
    title: "Locations & customers",
    copy: "Every site, the equipment in it, and the contact on-site. One kitchen or fifty.",
  },
  {
    icon: Split,
    title: "Vendor cards & routing",
    copy: "Email, phone, response window. A default vendor per category so every unit routes itself.",
  },
  {
    icon: Mail,
    title: "Work orders with status",
    copy: "Opened, acknowledged, ETA given, finished. Vendors act from the email; you see it on the request.",
  },
  {
    icon: Calendar,
    title: "Schedules & checklists",
    copy: "Recurring maintenance on a calendar. Inspection checklists walked from the tag.",
  },
  {
    icon: Printer,
    title: "Labels & sticker batches",
    copy: "Print-ready SVG or PNG per unit, or blank batches on a standard label sheet.",
  },
  {
    icon: Users,
    title: "Team roles",
    copy: "Owners handle billing and settings. Technicians handle equipment and requests. Unlimited staff on restaurant plans.",
  },
  {
    icon: Code,
    title: "Branding, export & API",
    copy: "Your logo and colors on customer pages from Pro. Data export and API access on Business.",
  },
];

const equipmentTypes = [
  "Dish machines",
  "Walk-ins & reach-ins",
  "Ice machines",
  "Fryers",
  "Ranges & flat-tops",
  "Combi & convection ovens",
  "Espresso machines",
  "Hood & exhaust",
  "Water filtration",
  "POS & printers",
];

const compareRows = [
  {
    label: "Time to first tag",
    cmms: "Weeks of configuration, asset hierarchies, and training before anyone scans anything.",
    equipqr: "Add an equipment type, print a code, stick it on. Minutes.",
  },
  {
    label: "Who can report a problem",
    cmms: "Staff with a login, an app, and training on the form.",
    equipqr: "Anyone with a phone camera. No app, no account, no email address required.",
  },
  {
    label: "Troubleshooting",
    cmms: "A ticket goes in. Someone drives out.",
    equipqr:
      "An AI-drafted guide per equipment type, edited by you, with a chat assistant for the rest. Requests carry what was already tried.",
  },
  {
    label: "Routing",
    cmms: "A dispatcher or manager reads the queue and assigns it.",
    equipqr: "The tag knows who services the unit. The request goes there, with the manager copied.",
  },
  {
    label: "Pricing",
    cmms: "Per seat, so every extra person on the account costs money.",
    equipqr:
      "Priced by equipment tier. Unlimited staff and vendor contacts on every restaurant plan. No overage charges.",
  },
];

// The five questions the design shows, in its order. Four come from the
// product FAQs and one ("What happens if a vendor doesn't respond?") from the
// owner FAQs; each is matched by a stable fragment of its question so the
// arrays in faq-data.ts can be reworded without silently dropping a row.
const faqPicks: readonly [readonly FaqEntry[], string][] = [
  [productFaqs, "app or make an account"],
  [productFaqs, "build the troubleshooting guides"],
  [productFaqs, "hasn't been assigned to a unit"],
  [ownerFaqs, "vendor doesn't respond"],
  [productFaqs, "control what my team"],
];
const homeFaqs: FaqEntry[] = faqPicks.flatMap(([list, needle]) => {
  const entry = list.find((item) => item.question.includes(needle));
  return entry ? [entry] : [];
});

// ------------------------------------------------------------- partials ---

const stepRule =
  "h-px bg-[linear-gradient(to_right,transparent,var(--eq-neutral-700)_48px,var(--eq-neutral-700)_calc(100%_-_48px),transparent)]";

/** "How it works" row: 48px accent number, H3, two paragraphs, mock beside it. */
function Step({
  number,
  title,
  children,
  visual,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
}) {
  return (
    <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-center gap-x-[clamp(24px,4vw,64px)] gap-y-6 py-9">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-[clamp(12px,2vw,24px)]">
        <div className="pt-[5px] text-[15px] leading-[1.3] text-primary tabular-nums">{number}</div>
        <div className="flex max-w-[48ch] flex-col gap-3 [&>p]:text-[16px] [&>p]:leading-[1.6] [&>p]:text-eq-neutral-400 [&>p+p]:text-[14px] [&>p+p]:leading-[1.55] [&>p+p]:text-eq-neutral-500">
          <h3 className="text-[clamp(22px,2vw,26px)] leading-[1.2] tracking-[-0.015em] font-medium">{title}</h3>
          {children}
        </div>
      </div>
      <div aria-hidden="true" className="flex min-w-0 justify-center">
        {visual}
      </div>
    </Reveal>
  );
}

/** Small accent-dot chat prompt used inside the guide-step mock. */
const mockCard =
  "flex w-full flex-col gap-[10px] rounded-xl border border-eq-neutral-800 bg-eq-surface p-4 shadow-eq-md";

function GuideStepMock() {
  return (
    <div className={cn(mockCard, "max-w-[320px]")}>
      <div className="flex items-center justify-between text-[11px] text-eq-neutral-500">
        <span className="uppercase tracking-[0.06em]">Step 3 of 6</span>
        <span>Dish machine guide</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-[2px] bg-eq-neutral-900">
        <div className="h-full w-1/2 bg-primary" />
      </div>
      <div className="mt-1 text-[14px] leading-[1.4] font-medium">Pull the drain screen. Is it clear of debris?</div>
      <div className="flex gap-2">
        <div className="grid flex-1 place-items-center rounded-md bg-eq-neutral-900 text-[11px] text-eq-neutral-500 [aspect-ratio:4/3]">
          Photo: drain screen
        </div>
        <div className="flex flex-1 flex-col">
          <PhoneOptions items={["Yes, it's clear", "No, clogged", "Can't reach it"]} />
        </div>
      </div>
      <PhoneInputRow placeholder="Where is the drain screen on this model?" />
    </div>
  );
}

function RequestEmailMock() {
  return (
    <div className={cn(mockCard, "max-w-[340px]")}>
      <div className="flex items-center gap-[10px]">
        <div className="grid size-[30px] shrink-0 place-items-center rounded-md bg-eq-accent-tint-16 text-primary">
          <Icon icon={Mail} size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] leading-[1.3] font-medium">
            New request: Dish machine, Unit 3 · Sunrise Diner
          </div>
          <div className="mt-[2px] text-[11px] text-eq-neutral-500">requests@equipqr.co · 4 min ago</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-[6px]">
        <Tag variant="neutral" className="rounded-[6px] px-[9px] py-[3px] font-normal">
          Can&rsquo;t operate without it
        </Tag>
        <Tag variant="neutral" className="rounded-[6px] px-[9px] py-[3px] font-normal">
          Not draining
        </Tag>
      </div>
      <PhoneCard title="AI summary">
        <span className="leading-[1.45] text-eq-neutral-300">
          Standing water after the cycle. Staff cleared the drain screen and checked the float switch; no change.
          Likely drain pump or solenoid. Bring both.
        </span>
      </PhoneCard>
      <div className="flex gap-2 text-center text-[12px] font-medium">
        <div className="flex-1 rounded-md border border-primary p-2 text-primary">Acknowledge</div>
        <div className="flex-1 rounded-md border border-eq-neutral-700 p-2">Give an ETA</div>
      </div>
    </div>
  );
}

const compareGrid =
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-x-6 px-[clamp(16px,2.5vw,28px)] max-[640px]:grid-cols-1";

/**
 * README §1.2: caption + five 140×44 logo slots between divider rules. The
 * slots are empty until real customer logos exist, which is why the band is
 * behind `showSocialProof` (BRIEF D7).
 */
function SocialProofBand() {
  return (
    <Section aria-label="Customers" className="pt-0">
      <Reveal className="flex flex-wrap items-center gap-x-10 gap-y-5 border-y border-eq-divider py-6">
        <p className="flex-[0_1_200px] text-[13px] leading-[1.4] text-eq-neutral-500">
          Service companies and kitchens running on EquipQR
        </p>
        <div className="grid flex-[1_1_500px] grid-cols-[repeat(auto-fit,minmax(140px,1fr))] justify-items-center gap-x-6 gap-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-11 w-[140px] rounded-md border border-dashed border-eq-neutral-700" />
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

// ----------------------------------------------------------------- page ---

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* 1. Hero */}
      <Section
        variant="hero"
        aria-labelledby="hero-title"
        containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-x-[clamp(32px,5vw,80px)] gap-y-12"
      >
        <Reveal>
          <div className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-eq-neutral-800 bg-[color-mix(in_srgb,var(--eq-surface)_70%,transparent)] py-[5px] pr-3 pl-2 text-[12.5px] text-eq-neutral-300">
            <Icon icon={Scan} size={16} className="text-primary" />
            <span>Purpose-built for commercial kitchen equipment</span>
          </div>
          <h1 id="hero-title" className={headingClass["h1-hero"]}>
            <span className="block">Scan the tag.</span>
            <span className="block">Fix it, or file the request.</span>
          </h1>
          <p className={cn(leadClass, "mt-[26px] max-w-[50ch]")}>{heroLead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="brand" size="xl" className="h-[46px] px-5" render={<Link href="/signup" />} nativeButton={false}>
              Start free trial
              <Icon icon={ArrowRight} size={16} data-icon="inline-end" />
            </Button>
            <Button
              variant="neutral"
              size="xl"
              className="h-[46px] px-5"
              render={<Link href="#how-it-works" />}
              nativeButton={false}
            >
              See how it works
            </Button>
          </div>
          <ul className="mt-7 grid max-w-[520px] grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-6 gap-y-[10px]">
            {heroPoints.map((point) => (
              <li key={point} className="flex items-center gap-[9px] text-[13.5px] text-eq-neutral-400">
                <CheckIcon size={16} className="text-primary" />
                {point}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delayMs={120} className="flex items-start justify-center gap-[18px] py-4">
          <PhoneFrame rotate={-4} className="translate-y-[22px]">
            <PhoneHeader kicker="Metro Refrigeration" title="Dish machine · Unit 3" subtitle="Back kitchen · Sunrise Diner" />
            <PhonePrompt>Is water draining at the end of the cycle?</PhonePrompt>
            <PhoneOptions items={["Yes, but slowly", "No, standing water", "It's draining now"]} selectedIndex={1} />
            <PhoneInputRow placeholder="Ask a question about this machine…" />
          </PhoneFrame>
          <PhoneFrame rotate={4} className="max-[560px]:hidden">
            <PhoneCheckCircle />
            <PhoneTitle>Request sent</PhoneTitle>
            <PhoneNote>Metro Refrigeration has your photos and what you already tried. Sunrise Diner was copied.</PhoneNote>
            <PhoneCard title="Already tried">Drain screen cleared · Float switch checked · Cycle re-run</PhoneCard>
            <PhonePhotoGrid />
            <PhonePrimary label="Call Metro Refrigeration" />
          </PhoneFrame>
        </Reveal>
      </Section>

      {/* 2. Social proof band: omitted until customer logos exist (BRIEF D7). */}
      {showSocialProof ? <SocialProofBand /> : null}

      {/* Facts band (Home.dc.html `data-facts`, between the hero and How it works). */}
      <Section aria-label="Facts" className="pt-0 pb-[clamp(48px,6vw,96px)]">
        <Reveal className="grid grid-cols-4 gap-x-8 gap-y-6 max-[820px]:grid-cols-2 max-[560px]:grid-cols-1">
          {facts.map((fact) => (
            <div key={fact.value} className="flex flex-col gap-2 border-l-2 border-primary pl-4">
              <span className="text-[clamp(32px,3vw,44px)] leading-none tracking-[-0.02em] font-medium tabular-nums">
                {fact.value}
              </span>
              <span className="text-[13.5px] leading-[1.45] text-eq-neutral-400">{fact.label}</span>
            </div>
          ))}
        </Reveal>
      </Section>

      {/* 3. How it works */}
      <Section id="how-it-works" rule aria-labelledby="how-title">
        <Reveal>
          <SectionHeader
            kicker="How it works"
            title="From the machine to resolved, in three steps."
            titleId="how-title"
            lead="The same flow whether the person scanning is your customer, a line cook at 7:40 on a Friday, or a technician on your own crew."
          />
        </Reveal>
        <div className="mt-6 flex flex-col">
          <div aria-hidden="true" className={stepRule} />
          <Step
            number="01"
            title="Scan the tag"
            visual={
              <TagMock
                company="Metro Refrigeration"
                unit="Dish machine · Unit 3 · Back kitchen"
                className="size-[208px] rotate-[-2deg] rounded-[14px] p-4"
              />
            }
          >
            <p>
              A durable QR sticker goes on the unit when you set it up. Scanning it opens a page for that exact machine,
              on any phone: make, model, location, who services it, and what to do next. No app to install, no account
              to make.
            </p>
            <p>
              Print codes per unit as SVG or PNG, or order pre-printed batches and claim each sticker on-site by
              photographing the nameplate.
            </p>
          </Step>
          <div aria-hidden="true" className={stepRule} />
          <Step number="02" title="Work the guide" visual={<GuideStepMock />}>
            <p>
              A short branching guide covers the usual causes first: breaker, water supply, drain screen, filter. Each
              step is a question, with a photo where it helps. A chat assistant answers anything the steps didn&rsquo;t
              cover.
            </p>
            <p>
              You describe the equipment type once; EquipQR drafts the guide in minutes. Review it, edit any step,
              publish, and every unit of that type uses it.
            </p>
          </Step>
          <div aria-hidden="true" className={stepRule} />
          <Step number="03" title="Resolved, or requested" visual={<RequestEmailMock />}>
            <p>
              When the guide fixes it, that&rsquo;s the end. When it doesn&rsquo;t, one tap files a service request with
              photos or a short video and an urgency level. Whoever services that unit gets an email with a summary of
              what was already tried.
            </p>
            <p>
              The vendor acknowledges, gives an ETA, and marks it done from the email. Every status change shows on the
              request, so nobody calls to check.
            </p>
          </Step>
          <div aria-hidden="true" className={stepRule} />
        </div>
      </Section>

      {/* 4. The dashboard */}
      <Section rule aria-labelledby="dash-title">
        <Reveal className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <SectionHeader
            kicker="The dashboard"
            title="One place for the tags, the guides, and everything that comes in after."
            titleId="dash-title"
          />
          <p className="max-w-[38ch] text-[15px] leading-[1.6] text-eq-neutral-400">
            Requests, equipment, locations, vendors, schedules. Owners run billing and settings; technicians work the
            queue.
          </p>
        </Reveal>
        <Reveal delayMs={100} className="mt-9">
          <DashboardFrame
            sidebar={
              <DashboardSidebar
                items={[
                  { label: "Overview" },
                  { label: "Equipment", count: 412 },
                  { label: "Requests", count: 7, countAccent: true, active: true },
                  { label: "Schedule" },
                  { label: "Customers" },
                  { label: "Vendors" },
                  { label: "Checklists" },
                  { label: "Maintenance" },
                  { label: "Settings" },
                ]}
                footer="Metro Refrigeration · Owner"
              />
            }
          >
            <DashboardToolbar
              title="Requests"
              chips={[
                { label: "All · 7", active: true },
                { label: "New" },
                { label: "Acknowledged" },
                { label: "Scheduled" },
                { label: "Done" },
              ]}
            />
            <DashboardStats>
              <DashboardStat label="Open" value="7" />
              <DashboardStat label="Awaiting ETA" value="3" />
              <DashboardStat label="Scheduled today" value="2" />
              <DashboardStat label="Resolved by guide, 30 days" value="41" />
            </DashboardStats>
            <DashboardTable columns={["Equipment", "Reported", "Urgency", "Status", "Age"]}>
              <DashboardRow
                title="Dish machine · Unit 3"
                subtitle="Sunrise Diner · Back kitchen"
                reported="Not draining, standing water"
                urgency="Can't operate"
                status={<Tag>New</Tag>}
                age="4 min"
              />
              <DashboardRow
                title="Walk-in cooler"
                subtitle="Sunrise Diner · Dry storage"
                reported="Reading 46°F, compressor running"
                urgency="Urgent"
                status={<Tag variant="neutral">Acknowledged</Tag>}
                age="22 min"
              />
              <DashboardRow
                title="Espresso machine · Bar 1"
                subtitle="Ninth Street Coffee"
                reported="Powers on, no water flow"
                urgency="Next nearby"
                status={<Tag variant="outline">ETA 2:30 pm</Tag>}
                age="1 h"
              />
              <DashboardRow
                title="Fryer 2"
                subtitle="Lakeside Grill · Line"
                reported="Won't hold temperature"
                urgency="Next visit"
                status={<Tag variant="neutral">Scheduled Thu</Tag>}
                age="3 h"
              />
              <DashboardRow
                title="Ice machine"
                subtitle="Lakeside Grill · Bar"
                reported="Not making ice"
                urgency="Urgent"
                status={<span className="text-[12px] whitespace-nowrap text-eq-neutral-500">Done · 41 min</span>}
                age="1 d"
              />
            </DashboardTable>
          </DashboardFrame>
        </Reveal>
      </Section>

      {/* 5. What changes */}
      <Section rule aria-labelledby="benefits-title">
        <Reveal>
          <SectionHeader
            kicker="What changes"
            title="Fewer trips, faster fixes, and a record on every unit."
            titleId="benefits-title"
          />
        </Reveal>
        <Reveal className="mt-10 grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[560px]:grid-cols-1">
          {benefits.map((benefit) => (
            <Panel
              key={benefit.title}
              padding="none"
              className="flex h-full flex-col gap-[14px] p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5"
            >
              <Icon icon={benefit.icon} size={22} className="text-primary" />
              <h3 className="text-[18px] leading-[1.3] tracking-[-0.01em] font-medium">{benefit.title}</h3>
              <p className="text-[15px] leading-[1.6] text-eq-neutral-400">{benefit.copy}</p>
            </Panel>
          ))}
        </Reveal>
      </Section>

      {/* 6. Who it's for */}
      <Section rule aria-labelledby="who-title">
        <Reveal>
          <SectionHeader kicker="Who it's for" title="Built for both sides of the service call." titleId="who-title" />
        </Reveal>
        <Reveal className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
          <Panel padding="none" hover={false} className="flex flex-col gap-5 p-[clamp(24px,3vw,36px)]">
            <Kicker>For service &amp; repair companies</Kicker>
            <h3 className="text-[clamp(22px,2vw,26px)] leading-[1.2] tracking-[-0.015em] font-medium">
              Tag every unit you service, across every client site.
            </h3>
            <FeatureList items={providerPoints} className="gap-3 leading-[1.55]" />
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="brand"
                size="xl"
                className="h-[42px] px-[18px] text-sm"
                render={<Link href="/signup" />}
                nativeButton={false}
              >
                Start free trial
              </Button>
              <GhostLink href="/features">See features</GhostLink>
              <span className="ml-auto text-[13px] text-eq-neutral-500 tabular-nums">From $29/mo</span>
            </div>
          </Panel>
          <Panel padding="none" hover={false} className="flex flex-col gap-5 p-[clamp(24px,3vw,36px)]">
            <Kicker>For restaurants &amp; kitchens</Kicker>
            <h3 className="text-[clamp(22px,2vw,26px)] leading-[1.2] tracking-[-0.015em] font-medium">
              Tag your own equipment. Any cook can send the right vendor a work order.
            </h3>
            <FeatureList items={ownerPoints} className="gap-3 leading-[1.55]" />
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="brand"
                size="xl"
                className="h-[42px] px-[18px] text-sm"
                render={<Link href="/signup?kind=owner" />}
                nativeButton={false}
              >
                Start free
              </Button>
              <GhostLink href="/restaurants">For restaurants</GhostLink>
              <span className="ml-auto text-[13px] text-eq-neutral-500 tabular-nums">Free, then from $24/mo</span>
            </div>
          </Panel>
        </Reveal>
      </Section>

      {/* 7. Everything in the box */}
      <Section rule aria-labelledby="caps-title">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-8">
          <SectionHeader
            kicker="Everything in the box"
            title="Small enough to set up in an afternoon. Complete enough to run the whole route on."
            titleId="caps-title"
            lead="Every plan includes the tags, the guides, and service requests with photos. Higher tiers add the chat assistant, sticker batches, branding, and the API."
            className="max-w-[440px]"
          >
            <GhostLink href="/features">All features</GhostLink>
          </SectionHeader>
          <div data-caps="" className="grid grid-cols-2 gap-x-7 gap-y-[22px] max-[560px]:grid-cols-1">
            {capabilities.map((cap) => (
              <IconRow key={cap.title} icon={cap.icon} title={cap.title} titleAs="div">
                {cap.copy}
              </IconRow>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* 8. Kitchen first */}
      <Section rule aria-labelledby="kitchen-title">
        <Reveal>
          <Panel
            padding="none"
            hover={false}
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-center gap-x-[clamp(32px,5vw,72px)] gap-y-6 rounded-[16px] p-[clamp(28px,4vw,48px)]"
          >
            <SectionHeader
              kicker="Kitchen first"
              title="Made for the machines in a commercial kitchen, not adapted from a warehouse tool."
              titleId="kitchen-title"
              titleClassName="text-[clamp(24px,2.6vw,32px)] leading-[1.15]"
              lead="Symptom chips, guide templates, and vendor categories start from the equipment a kitchen actually runs. Add your own types in minutes."
              leadClassName="mt-[14px] max-w-[46ch] text-[15px]"
            />
            <ul className="flex flex-wrap gap-2 text-[14px]">
              {equipmentTypes.map((type) => (
                <li key={type} className="rounded-full border border-eq-neutral-800 px-[14px] py-2 text-eq-neutral-200">
                  {type}
                </li>
              ))}
              <li className="rounded-full border border-dashed border-eq-neutral-700 px-[14px] py-2 text-eq-neutral-500">
                + your own types
              </li>
            </ul>
          </Panel>
        </Reveal>
      </Section>

      {/* 9. Versus a general CMMS */}
      <Section rule aria-labelledby="compare-title">
        <Reveal>
          <SectionHeader
            kicker="Versus a general CMMS"
            title="Dead simple to start. That's the point."
            titleId="compare-title"
            lead="General asset and maintenance tools can do a lot, once someone configures them and trains everyone. EquipQR starts from the sticker."
          />
        </Reveal>
        <Reveal className="mt-9 overflow-hidden rounded-xl border border-eq-neutral-900">
          <div
            data-compare-head=""
            className={cn(
              compareGrid,
              "border-b border-eq-neutral-900 bg-eq-surface py-[14px] text-[12px] uppercase tracking-[0.06em] text-eq-neutral-500 max-[640px]:hidden"
            )}
          >
            <span />
            <span>General CMMS / asset tools</span>
            <span className="text-primary">EquipQR</span>
          </div>
          {compareRows.map((row) => (
            <div
              key={row.label}
              data-compare=""
              className={cn(
                compareGrid,
                "gap-y-2 border-b border-eq-neutral-900 py-5 text-[15px] leading-[1.55] last:border-b-0"
              )}
            >
              <div className="font-medium">{row.label}</div>
              <div className="text-eq-neutral-500">{row.cmms}</div>
              <div className="flex gap-[10px] text-eq-neutral-200">
                <CheckIcon size={18} className="mt-[2px] text-primary" />
                <span>{row.equipqr}</span>
              </div>
            </div>
          ))}
        </Reveal>
      </Section>

      {/* 10. Quote: placeholder, omitted until a real customer quote exists (BRIEF D7). */}

      {/* 11. Questions */}
      <Section rule aria-labelledby="faq-title">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-8">
          <SectionHeader
            kicker="Questions"
            title="The things people ask before their first sticker."
            titleId="faq-title"
            className="max-w-[400px]"
            lead={
              <>
                More on the{" "}
                <Link href="/faq" className="text-primary underline underline-offset-[3px] hover:text-eq-accent-300">
                  full FAQ
                </Link>
                , including billing and restaurant-specific answers.
              </>
            }
          />
          <FaqList items={homeFaqs} />
        </Reveal>
      </Section>

      {/* 12. Built on a real route */}
      <Section rule aria-labelledby="story-title">
        <Reveal className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-[clamp(16px,3vw,32px)]">
          <LogoMark className="size-10 text-eq-accent" />
          <div className="max-w-[64ch]">
            <h2 id="story-title" className="text-[clamp(22px,2.2vw,28px)] leading-[1.2] tracking-[-0.015em] font-medium">
              Built on a real route, not a whiteboard.
            </h2>
            <p className="mt-[14px] text-[16px] leading-[1.65] text-eq-neutral-400">
              EquipQR is built by a working repair technician who services commercial coffee and espresso machines
              across Dallas–Fort Worth. Most of the calls that filled his day were the same handful of things: a tripped
              breaker, an empty water line, a clogged group head. None of it needed a truck. So he put a QR sticker on
              every machine on his route. This is that tool, made for any team tired of driving out for a reset button.
            </p>
            <GhostLink href="/about" className="mt-4">
              About EquipQR
            </GhostLink>
          </div>
        </Reveal>
      </Section>

      {/* 13. CTA panel */}
      <Section variant="cta" aria-labelledby="cta-title">
        <Reveal>
          <CtaPanel
            title="Put a tag on your first machine today."
            titleId="cta-title"
            primary={{ href: "/signup", label: "Start free trial" }}
            secondary={{ href: "/contact", label: "Talk to us first" }}
            note="Cancel anytime from Settings → Billing with nothing owed. Payments by Stripe; we never see your card."
          >
            Set up an equipment type and print the first QR code in minutes. {TRIAL_DAYS} days of full Pro features, no
            credit card. Restaurants: free for one location, forever.
          </CtaPanel>
        </Reveal>
      </Section>
    </>
  );
}
