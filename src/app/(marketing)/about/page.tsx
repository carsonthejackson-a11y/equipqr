import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { Coffee, MapPin, Wrench } from "lucide-react";
import { CtaPanel } from "../_components/cta-panel";
import { Icon } from "../_components/icon";
import { SectionHeader } from "../_components/kicker";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";

// docs/design/marketing-2026-09/About.dc.html → README "Screens → 6. About".
// Story paragraphs are kept verbatim from the previous version of this page
// (README: "paragraphs from about/page.tsx verbatim"); see notes/ws10.md for
// the punctuation differences against the design file.

export const metadata: Metadata = {
  title: "About",
  description:
    "EquipQR was built by a working commercial coffee and espresso machine repair technician in Dallas–Fort Worth to cut down his own truck rolls.",
};

// BRIEF D7: the 4:5 "photo from the route" slot ships omitted until a real
// photo exists. Flip this once there is an asset to drop into the aside.
const showPhoto = false;

const facts: { icon: LucideIcon; label: string }[] = [
  { icon: Wrench, label: "Working repair technician" },
  { icon: Coffee, label: "Commercial coffee & espresso" },
  { icon: MapPin, label: "Dallas–Fort Worth, TX" },
];

export default function AboutPage() {
  return (
    <>
      <Section variant="hero" className="pb-[clamp(24px,3vw,40px)]" aria-labelledby="page-title">
        <Reveal>
          <SectionHeader
            kicker="About"
            size="h1"
            titleId="page-title"
            title="Built on a route, not in a boardroom."
            lead="EquipQR started as one technician’s fix for his own dispatch problem."
            className="max-w-[800px]"
            leadClassName="max-w-[56ch]"
          />
        </Reveal>
      </Section>

      <Section className="pt-[clamp(24px,3vw,48px)]" aria-label="The story">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-10">
          <div className="flex max-w-[62ch] flex-col gap-5 text-[clamp(16.5px,1.25vw,18px)] leading-[1.7] text-eq-neutral-300">
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
            {/* README "Typography" → Pull line. */}
            <p className="my-3 border-l-2 border-primary pl-5 text-[clamp(24px,2.4vw,32px)] leading-[1.25] font-medium tracking-[-0.02em] text-eq-text">
              The truck rolls that are left are the ones that actually need a truck.
            </p>
            <p>
              That’s the entire premise EquipQR is built on, and it’s why the guides, the stickers,
              and the dispatch summaries are built the way a technician — not a product team —
              would want them: fast to set up, obvious to use, and aimed squarely at cutting down
              the number of times the phone rings for something a sticker could have answered.
            </p>
          </div>

          <aside
            className="flex max-w-[420px] flex-col gap-[14px] min-[761px]:sticky min-[761px]:top-[88px]"
            aria-label="About the technician"
          >
            {showPhoto ? (
              <div className="aspect-[4/5] overflow-hidden rounded-[14px] border border-eq-neutral-900 bg-eq-surface" />
            ) : null}
            <ul className="flex flex-col gap-2">
              {facts.map(({ icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-[10px] border border-eq-neutral-900 bg-eq-surface px-[14px] py-3 text-[14.5px]"
                >
                  <Icon icon={icon} size={22} className="text-primary" />
                  {label}
                </li>
              ))}
            </ul>
          </aside>
        </Reveal>
      </Section>

      <Section variant="cta" aria-labelledby="cta-title">
        <Reveal>
          <CtaPanel
            titleId="cta-title"
            title="Running a route of your own?"
            primary={{ href: "/signup", label: "Start free trial" }}
            secondary={{ href: "/contact", label: "Get in touch" }}
          >
            Try EquipQR free for 14 days and see how much of your call volume a sticker can answer.
          </CtaPanel>
        </Reveal>
      </Section>
    </>
  );
}
