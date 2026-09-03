import Link from "next/link";
import {
  QrCode,
  MessagesSquare,
  Camera,
  Bot,
  Database,
  Users,
  ArrowRight,
  Wrench,
  Coffee,
  Droplet,
  Utensils,
  Stethoscope,
  Dumbbell,
  AirVent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqList } from "./_components/faq-item";
import { productFaqs } from "./_components/faq-data";
import { PricingCards } from "./_components/pricing-cards";
import { PhoneFrame, ScanScreen, GuideScreen, RequestScreen } from "./_components/phone-mock";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from "@/lib/site";
import { TRIAL_DAYS } from "@/lib/plans";

const features = [
  {
    icon: Bot,
    title: "AI-drafted troubleshooting guides",
    description:
      "Describe an equipment type once and get a full branching guide in minutes — not a week of writing decision trees by hand.",
  },
  {
    icon: MessagesSquare,
    title: "Chat-style troubleshooting assistant",
    description:
      "When the scripted steps don't cover it, customers can ask a question in plain language and get a real answer, right there on the guide.",
  },
  {
    icon: Camera,
    title: "Service requests with photos & video",
    description:
      "Customers attach photos or a short video of the problem before they ever pick up the phone — you see it before you roll a truck.",
  },
  {
    icon: QrCode,
    title: "AI dispatch summary in your inbox",
    description:
      "Every request email includes an AI summary of what the customer already tried, so whoever picks it up knows what to bring.",
  },
  {
    icon: Database,
    title: "Customer & equipment records",
    description:
      "Every unit is tied to a customer, a location, and a full history of guides shown and requests filed — searchable from the dashboard.",
  },
  {
    icon: Users,
    title: "Team roles that make sense",
    description:
      "Owners run billing and settings; technicians work equipment and requests. Nobody sees another company's data — ever.",
  },
];

const industries = [
  { icon: AirVent, label: "HVAC" },
  { icon: Coffee, label: "Commercial coffee & espresso" },
  { icon: Droplet, label: "Plumbing" },
  { icon: Utensils, label: "Restaurant equipment" },
  { icon: Stethoscope, label: "Medical devices" },
  { icon: Dumbbell, label: "Gym equipment" },
];

const steps = [
  {
    number: "1",
    title: "Customer scans the sticker",
    description:
      "No app, no login. The QR code on the unit opens a mobile page built for that exact piece of equipment.",
    screen: <ScanScreen />,
  },
  {
    number: "2",
    title: "They work the guide",
    description:
      "A branching, AI-drafted troubleshooting guide walks them through the usual fixes — with a chat assistant for anything it didn't cover.",
    screen: <GuideScreen />,
  },
  {
    number: "3",
    title: "If it's still broken, they tell you",
    description:
      "One tap files a service request with photos or video. You get an email with an AI summary of what they already tried.",
    screen: <RequestScreen />,
  },
];

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

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
              Built for field-service teams
            </div>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Stop the truck roll before it starts.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground text-pretty">
              Put a QR sticker on every unit you service. Customers scan it, work through an
              AI-drafted troubleshooting guide, and only file a service request when they
              actually need one — with photos and an AI summary already waiting in your inbox.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button render={<Link href="/signup" />} nativeButton={false} size="lg">
                Start free trial
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
              {TRIAL_DAYS}-day free trial · full Pro features · no credit card
            </p>
          </div>

          <div className="mx-auto">
            <PhoneFrame className="w-64 rotate-2">
              <GuideScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 text-muted-foreground">
              Three steps between a confused customer and either a fixed machine or a dispatch
              that’s actually ready to go.
            </p>
          </div>

          <div className="mt-14 grid gap-10 sm:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center text-center">
                <PhoneFrame className="mb-6">{step.screen}</PhoneFrame>
                <div className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mt-3 font-heading text-base font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-border/80">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              Everything the call center used to handle
            </h2>
            <p className="mt-3 text-muted-foreground">
              One dashboard for the guides, the stickers, and the requests that come in after.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
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

      {/* Industries */}
      <section className="border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <p className="text-center text-sm font-medium text-muted-foreground">
            Built for the trades that live on service calls
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {industries.map((ind) => (
              <div
                key={ind.label}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-3 py-5 text-center"
              >
                <ind.icon className="size-6 text-primary" />
                <span className="text-xs font-medium text-foreground">{ind.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why we built this */}
      <section className="border-t border-border/80">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[auto_1fr] lg:items-start">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Wrench className="size-7" />
          </div>
          <div className="max-w-2xl space-y-4">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              Built on a real route, not a whiteboard
            </h2>
            <p className="text-muted-foreground">
              EquipQR is built by a working repair technician who services commercial coffee
              and espresso machines across Dallas–Fort Worth. Most of the calls that filled up
              his day turned out to be the same handful of things: a tripped breaker, an empty
              water line, a clogged group head. None of it needed a truck.
            </p>
            <p className="text-muted-foreground">
              So he put a QR sticker on every machine on his route. Customers who scan it now
              try the two or three things that actually fix most problems before they call —
              and when they do call, he already knows what they tried and what to bring. Fewer
              wasted trips, faster fixes, and a sticker with his name on it sitting on every
              machine he services.
            </p>
            <p className="text-muted-foreground">
              That’s the whole product: the tool one tech built to run his own route, made for
              any team that’s tired of driving out for a reset button.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" className="scroll-mt-16 border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              Simple pricing, no overage surprises
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every plan includes a {TRIAL_DAYS}-day free trial with full Pro features. No credit
              card required.
            </p>
          </div>

          <PricingCards interval="month" className="mt-12" />

          <div className="mt-8 text-center">
            <Button render={<Link href="/pricing" />} nativeButton={false} variant="outline">
              Compare all plan details
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 border-t border-border/80">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-muted-foreground">
              More in the{" "}
              <Link href="/faq" className="text-primary underline-offset-4 hover:underline">
                full FAQ
              </Link>
              .
            </p>
          </div>
          <FaqList items={productFaqs.slice(0, 4)} className="mt-10" />
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/80">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            Put your first sticker on a unit today
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Set up your first equipment type and QR code in minutes. No credit card, no
            commitment — cancel the trial anytime with nothing owed.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/signup" />} nativeButton={false} size="lg">
              Start free trial
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
