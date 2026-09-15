import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Icon } from "../_components/icon";
import { SectionHeader } from "../_components/kicker";
import { Panel } from "../_components/panel";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";
import { ContactForm } from "./contact-form";

// docs/design/marketing-2026-09/Contact.dc.html → README "Screens → 7. Contact".

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Questions about pricing, setting up your first guide, or ordering sticker batches. We read every message.",
};

const inlineLinkClass =
  "text-primary underline underline-offset-[3px] transition-colors duration-150 hover:text-eq-accent-300";

// README "Contact": info cards are surface panels with a 22px accent icon,
// `padding: 18px 20px`. The mail card's border goes to the accent on hover.
const infoCardClass = "flex gap-[14px] px-5 py-[18px]";

export default function ContactPage() {
  return (
    <>
      <Section variant="hero" className="pb-[clamp(24px,3vw,40px)]" aria-labelledby="page-title">
        <Reveal>
          <SectionHeader
            kicker="Contact"
            size="h1"
            titleId="page-title"
            title="Get in touch."
            lead="Questions about pricing, setting up your first guide, or ordering sticker batches. We read every message."
            className="max-w-[760px]"
            leadClassName="max-w-[56ch]"
          />
        </Reveal>
      </Section>

      {/* The design's last section carries the CTA-section bottom padding (no CTA panel). */}
      <Section
        className="pt-[clamp(24px,3vw,48px)] pb-[clamp(72px,9vw,128px)]"
        aria-label="Ways to reach us"
      >
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-8">
          <aside
            className="flex max-w-[420px] flex-col gap-3 min-[761px]:sticky min-[761px]:top-[88px]"
            aria-label="Other ways to reach us"
          >
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="group block rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Panel
                padding="none"
                hover={false}
                className={`${infoCardClass} transition-colors duration-200 group-hover:border-primary group-focus-visible:border-primary`}
              >
                <Icon icon={Mail} size={22} className="mt-px text-primary" />
                <div>
                  <div className="text-[16px] leading-[1.4] font-medium">Email us directly</div>
                  <div className="mt-[3px] text-[14.5px] text-eq-neutral-400">{SUPPORT_EMAIL}</div>
                </div>
              </Panel>
            </a>
            <Panel padding="none" hover={false} className={infoCardClass}>
              <Icon icon={Clock} size={22} className="mt-px text-primary" />
              <div>
                <div className="text-[16px] leading-[1.4] font-medium">Response time</div>
                <div className="mt-[3px] text-[14.5px] leading-[1.55] text-eq-neutral-400">
                  Usually within one business day. Pro and Business plans get priority support.
                </div>
              </div>
            </Panel>
            <p className="mt-2 text-[14px] leading-[1.6] text-eq-neutral-500">
              Looking for an answer right now? Most questions about setup and billing are on the{" "}
              <Link href="/faq" className={inlineLinkClass}>
                FAQ page
              </Link>
              .
            </p>
          </aside>

          <div className="rounded-[16px] border border-eq-neutral-900 bg-eq-surface p-[clamp(22px,3vw,32px)] shadow-eq-sm">
            <ContactForm />
          </div>
        </Reveal>
      </Section>
    </>
  );
}
