import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  MapPin,
  MessagesSquare,
  PhoneCall,
  QrCode,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqList } from "../_components/faq-item";
import { ownerFaqs } from "../_components/faq-data";
import { OwnerPricingCards } from "../_components/owner-pricing-cards";
import { PhoneFrame } from "../_components/phone-mock";
import { cn } from "@/lib/utils";

// docs/OWNER-ROADMAP-BRIEF.md §3.4.2. Copy rules: no fabricated customers,
// logos, testimonials, or numbers beyond the one attributed stat below. The
// "Sunrise Diner" / "Metro Refrigeration" names in the phone mocks are
// illustrative placeholder content (same convention as phone-mock.tsx's
// "Unit #14"), not a claimed real customer.
export const metadata: Metadata = {
  title: "For Restaurants & Small Business",
  description:
    "Tag your kitchen equipment with a QR code so any staff member can send a work order straight to the vendor who services it — no app, no login, no manager required.",
};

const steps = [
  {
    number: "1",
    title: "Tag it",
    description:
      "Put a QR sticker on every piece of equipment when you set it up — the dish machine, the walk-in, the fryer, the POS terminal.",
  },
  {
    number: "2",
    title: "Staff scans it",
    description:
      "Something's wrong? Any cook, server, or dishwasher scans the tag with their phone camera. No app to install, no account to make.",
  },
  {
    number: "3",
    title: "They tap what's happening",
    description:
      "Symptom chips built for restaurant equipment — \"Not draining,\" \"Not heating,\" \"Error code\" — plus an optional photo and how urgent it is.",
  },
  {
    number: "4",
    title: "It goes straight to your vendor",
    description:
      "EquipQR emails the vendor on file for that unit — or you, if none is set — with the phone number handed right back to whoever reported it.",
  },
];

const ownerSees = [
  {
    icon: MapPin,
    title: "Every location, one dashboard",
    description:
      "Locations, the equipment at each one, and who's supposed to service it — whether you run one kitchen or five.",
  },
  {
    icon: Truck,
    title: "Vendor contact cards",
    description:
      "Save each vendor once — email, phone, SLA — and set one as the default for a whole category, like refrigeration. Every unit picks a vendor without you doing it by hand.",
  },
  {
    icon: MessagesSquare,
    title: "Work orders with dispatch status",
    description:
      "See when a vendor opened the email, acknowledged it, gave an ETA, or finished — right on the request, without calling to check.",
  },
  {
    icon: ShieldCheck,
    title: "A free tier you're never locked out of",
    description:
      "Start on Free — one location, 10 units, no credit card. If you outgrow it, upgrade; if you don't, you keep working either way.",
  },
];

function StaffReportScreen() {
  const chips = ["Not making ice", "Ice tastes bad", "Bin not filling", "Won't start"];
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="space-y-0.5">
        <p className="text-[10px] font-medium text-foreground">Ice machine</p>
        <p className="text-[9px] text-muted-foreground">Back kitchen</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => (
          <span
            key={chip}
            className={cn(
              "rounded-full border px-2 py-1 text-[9px]",
              i === 0
                ? "border-primary/40 bg-accent font-medium text-accent-foreground"
                : "border-border text-foreground"
            )}
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-1 space-y-1 rounded-lg border border-border p-2">
        <p className="text-[9px] text-muted-foreground">How urgent is this?</p>
        <p className="text-[10px] font-medium text-foreground">We can&apos;t operate without this</p>
      </div>
      <div className="mt-auto rounded-lg bg-primary py-1.5 text-center text-[10px] font-medium text-primary-foreground">
        Send work order
      </div>
    </div>
  );
}

function StaffConfirmScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Check className="size-4" />
      </div>
      <p className="text-[10px] font-medium text-foreground">Sent to Metro Refrigeration</p>
      <p className="text-[9px] text-muted-foreground">Sunrise Diner was notified too.</p>
      <div className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-[9px] font-medium text-foreground">
        <PhoneCall className="size-2.5" />
        Call Metro Refrigeration
      </div>
    </div>
  );
}

export default function RestaurantsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[32rem] bg-[radial-gradient(60%_55%_at_50%_0%,var(--accent),transparent)]"
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:py-28">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <QrCode className="size-3.5 text-primary" />
              For restaurants & small business
            </div>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Tag the kitchen. Any cook can send the right vendor a work order.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground text-pretty">
              Put a QR sticker on every machine in the building. When something breaks,
              whoever&apos;s standing there scans it, taps what&apos;s wrong, and it goes straight
              to the vendor who services it — no app, no manager on shift, no guessing who to
              call.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button render={<Link href="/signup?kind=owner" />} nativeButton={false} size="lg">
                Start free
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
              <Button
                render={<Link href="#how-it-works" />}
                nativeButton={false}
                variant="outline"
                size="lg"
              >
                See how it works
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Free forever for one location · no credit card
            </p>
          </div>

          <div className="mx-auto">
            <PhoneFrame className="w-64 rotate-2">
              <StaffReportScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* The 7:40pm story */}
      <section className="border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            It&apos;s 7:40pm on a Friday
          </h2>
          <div className="mt-4 space-y-4 text-muted-foreground">
            <p>
              The dish machine stops draining mid-rush. The manager who knows which repair
              company handles it isn&apos;t on shift. Nobody can find the invoice with the
              vendor&apos;s number on it. Someone starts scrolling through old texts, or worse,
              calls around the industry hoping someone answers this late.
            </p>
            <p>
              With a QR tag on the machine, that same moment looks different: a dishwasher scans
              the sticker, taps &quot;Not draining,&quot; and it&apos;s sent — to the vendor on
              file for that unit, with the manager copied by email. No lookup, no group text, no
              waiting for someone with the right phone number to show up.
            </p>
            <p className="text-sm">
              In MachineQ&apos;s 2026 survey of restaurant operators, 49% said equipment failure
              or unplanned maintenance had caused downtime.{" "}
              <span className="text-muted-foreground/80">
                (MachineQ 2026 restaurant equipment report, via restaurantnews.com)
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-t border-border/80">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              Four steps, no phone tree
            </h2>
            <p className="mt-3 text-muted-foreground">
              Nobody on shift needs to know who the vendor is — the tag already does.
            </p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mt-4 font-heading text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What staff see */}
      <section className="border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 space-y-4 lg:order-1">
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <QrCode className="size-5.5" />
              </div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                What staff see
              </h2>
              <p className="text-muted-foreground">
                A phone camera and a few taps. Pick what&apos;s wrong from chips built for
                restaurant equipment, add a photo if it helps, and say how urgent it is —
                &quot;whenever they&apos;re next nearby&quot; up to &quot;we can&apos;t operate
                without this.&quot;
              </p>
              <p className="text-muted-foreground">
                The confirmation screen names the vendor and hands over their phone number right
                there, in case it can&apos;t wait for an email reply.
              </p>
            </div>
            <div className="order-1 mx-auto flex items-center gap-6 lg:order-2">
              <PhoneFrame className="w-56 -rotate-3">
                <StaffReportScreen />
              </PhoneFrame>
              <PhoneFrame className="hidden w-56 rotate-3 sm:block">
                <StaffConfirmScreen />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </section>

      {/* What the owner sees */}
      <section className="border-t border-border/80">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              What you see
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every location, every unit, and every work order — without living in a group text.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ownerSees.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-heading text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              Free to start, simple to grow into
            </h2>
            <p className="mt-3 text-muted-foreground">
              One location and 10 units, free, forever. Upgrade when you need more — never
              because your trial ran out.
            </p>
          </div>

          <OwnerPricingCards className="mt-12" />

          <div className="mt-8 text-center">
            <Button render={<Link href="/pricing?for=owners" />} nativeButton={false} variant="outline">
              Compare all plan details
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/80">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 className="text-center font-heading text-3xl font-semibold tracking-tight">
            Questions from restaurants & small business
          </h2>
          <FaqList items={ownerFaqs} className="mt-10" />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/80">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            Put a tag on your first machine today
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Free for one location, no credit card. Add your equipment and vendors in minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/signup?kind=owner" />} nativeButton={false} size="lg">
              Start free
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
            <Button render={<Link href="/contact" />} nativeButton={false} variant="outline" size="lg">
              Talk to us first
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
