import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Camera, Printer, Users, ShieldCheck, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneFrame, GuideScreen, RequestScreen } from "../_components/phone-mock";

export const metadata: Metadata = {
  title: "Features",
  description:
    "AI-drafted troubleshooting guides, chat-style assistance, service requests with photos, AI dispatch summaries, and pre-printed sticker batches — everything EquipQR does for field-service teams.",
};

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-border/80 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Everything between a scan and a fixed unit
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            One sticker, one page, and a dashboard that turns every scan into either a resolved
            customer or a ready-to-dispatch service request.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Bot className="size-5.5" />
            </div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Guides that write themselves
            </h2>
            <p className="text-muted-foreground">
              Describe an equipment type and its common failure modes once — EquipQR drafts a
              full branching troubleshooting guide in minutes, with a question at every step and
              a clear outcome at every branch: fixed, keep going, or escalate to a service
              request.
            </p>
            <p className="text-muted-foreground">
              Edit any step before you publish, and reuse the same guide across every unit of
              that equipment type. When a customer’s question isn’t covered by the script, a
              chat-style assistant steps in and answers in plain language, right on the same
              page — no phone call required.
            </p>
          </div>
          <PhoneFrame className="justify-self-center">
            <GuideScreen />
          </PhoneFrame>
        </div>
      </section>

      <section className="border-t border-border/80 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <PhoneFrame className="order-2 justify-self-center lg:order-1">
              <RequestScreen />
            </PhoneFrame>
            <div className="order-1 space-y-4 lg:order-2">
              <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Camera className="size-5.5" />
              </div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight">
                Service requests that arrive dispatch-ready
              </h2>
              <p className="text-muted-foreground">
                When the guide doesn’t fix it, the customer files a service request in the same
                flow — description, contact info, and photos or a short video of the problem,
                all from their phone.
              </p>
              <p className="text-muted-foreground">
                You get an email the moment it’s submitted, with an AI-written summary of what
                they already tried and what they saw. No more “it’s just not working” voicemail
                — whoever picks up the ticket knows what to bring before they leave the shop.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            And the operational basics, covered
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Printer className="size-5" />
            </div>
            <h3 className="mt-4 font-heading text-lg font-semibold">
              Stickers, printed your way
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Generate a QR code the instant you add a unit and print it yourself, or order a
              batch of durable, weatherproof stickers pre-linked and ready to slap on before you
              head out on the route.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Gauge className="size-5" />
            </div>
            <h3 className="mt-4 font-heading text-lg font-semibold">
              Customer & equipment records
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Every unit is tied to a customer, a location, and a running history of guides
              shown and requests filed — so you always know what’s been tried on that specific
              machine before.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Users className="size-5" />
            </div>
            <h3 className="mt-4 font-heading text-lg font-semibold">
              Roles built for a crew
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Owners handle billing, team, and settings. Technicians work equipment, customers,
              and requests without touching the money. Add a technician in seconds when the crew
              grows.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="mt-4 font-heading text-lg font-semibold">
              Isolated by design
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Every company’s equipment, customers, and requests are walled off at the database
              level. There’s no shared table a bug could leak across accounts.{" "}
              <Link href="/security" className="text-primary underline-offset-4 hover:underline">
                See how
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border/80">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="font-heading text-3xl font-semibold tracking-tight">
            Ready to put a sticker on your first unit?
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/signup" />} nativeButton={false} size="lg">
              Start free trial
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
            <Button render={<Link href="/pricing" />} nativeButton={false} variant="outline" size="lg">
              See pricing
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
