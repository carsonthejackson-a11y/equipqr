import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Wrench, Coffee, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "EquipQR was built by a working commercial coffee and espresso machine repair technician in Dallas–Fort Worth to cut down his own truck rolls.",
};

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-border/80 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Built on a route, not in a boardroom
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            EquipQR started as one technician’s fix for his own dispatch problem.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="space-y-6 text-muted-foreground">
          <p>
            EquipQR is built and run by a working repair technician who services commercial
            coffee and espresso machines across the Dallas–Fort Worth area. Every weekday he
            drives a route of cafes, offices, and restaurants — and for a long time, a big chunk
            of that route was truck rolls that didn’t need to happen.
          </p>
          <p>
            A machine would go down, someone would call the shop, and the details would get lost
            somewhere between “it’s not working” and an actual dispatch. More often than not, the
            fix was something the customer could have done themselves in thirty seconds: reset a
            tripped breaker, open a shut-off valve, clear a jammed portafilter. But there was no
            good way to hand that information to a customer standing in front of a broken
            machine, and no good way to know what they’d already tried before he got there.
          </p>
          <p>
            So he put a QR code sticker on every machine on his route. Scan it, and a customer
            gets a short troubleshooting guide built for that exact model — no app, no account,
            just the questions a technician would ask them over the phone, answered in order.
            Most of the time, that’s the whole interaction. When it isn’t, the same page lets
            them file a service request with a photo, and the request lands in his inbox with a
            summary of exactly what they already tried.
          </p>
          <p>
            The truck rolls that are left are the ones that actually need a truck. That’s the
            entire premise EquipQR is built on, and it’s why the guides, the stickers, and the
            dispatch summaries are built the way a technician — not a product team — would want
            them: fast to set up, obvious to use, and aimed squarely at cutting down the number
            of times the phone rings for something a sticker could have answered.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Wrench className="size-5 shrink-0 text-primary" />
            <span className="text-sm text-foreground">Working repair technician</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Coffee className="size-5 shrink-0 text-primary" />
            <span className="text-sm text-foreground">Commercial coffee & espresso</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <MapPin className="size-5 shrink-0 text-primary" />
            <span className="text-sm text-foreground">Dallas–Fort Worth, TX</span>
          </div>
        </div>
      </section>

      <section className="border-t border-border/80">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Running a route of your own?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Try EquipQR free for 14 days and see how much of your call volume a sticker can
            answer.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/signup" />} nativeButton={false} size="lg">
              Start free trial
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
            <Button render={<Link href="/contact" />} nativeButton={false} variant="outline" size="lg">
              Get in touch
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
