import Link from "next/link";
import type { Metadata } from "next";
import { CtaPanel } from "../_components/cta-panel";
import { FaqList } from "../_components/faq-item";
import { productFaqs, billingFaqs, ownerFaqs } from "../_components/faq-data";
import type { FaqEntry } from "../_components/faq-item";
import { JumpNav } from "../_components/jump-nav";
import { headingClass, introClass, Kicker, leadClass } from "../_components/kicker";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";

// docs/design/marketing-2026-09/FAQ.dc.html → /faq (README "5. FAQ", BRIEF WS9).

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about how EquipQR works, how billing is handled, and how it works for restaurants and kitchens tagging their own equipment.",
};

// Design flags (FAQ.dc.html `data-props`). `openFirst` opens the first answer
// of every group on load; `showRestaurants` renders the third group and its
// jump-nav pill.
const openFirst = true;
const showRestaurants = true;

// Inline text link (design: accent, underlined, 3px offset; README hover → accent-300).
const inlineLinkClass =
  "text-primary underline underline-offset-[3px] transition-colors duration-150 hover:text-eq-accent-300";

type FaqGroup = {
  id: string;
  number: string;
  label: string;
  title: string;
  /** One-line link to the related page, under the H2. */
  related: React.ReactNode;
  items: readonly FaqEntry[];
};

const groups: FaqGroup[] = [
  {
    id: "product",
    number: "01",
    label: "Product",
    title: "How the sticker, the guide, and the request fit together.",
    related: (
      <>
        For the full tour, see{" "}
        <Link href="/features" className={inlineLinkClass}>
          Features
        </Link>
        .
      </>
    ),
    items: productFaqs,
  },
  {
    id: "billing",
    number: "02",
    label: "Billing",
    title: "Trials, limits, and what happens at the card.",
    related: (
      <>
        Plans and limits are on the{" "}
        <Link href="/pricing" className={inlineLinkClass}>
          pricing page
        </Link>
        .
      </>
    ),
    items: billingFaqs,
  },
  ...(showRestaurants
    ? [
        {
          id: "restaurants",
          number: "03",
          label: "Restaurants & kitchens",
          title: "For owners tagging their own equipment.",
          related: (
            <>
              How it works for a kitchen is on the{" "}
              <Link href="/restaurants" className={inlineLinkClass}>
                restaurants page
              </Link>
              .
            </>
          ),
          items: ownerFaqs,
        } satisfies FaqGroup,
      ]
    : []),
];

export default function FaqPage() {
  return (
    <>
      {/* Hero */}
      <Section variant="hero" aria-labelledby="page-title" className="pb-[clamp(24px,3vw,40px)]">
        <Reveal className="max-w-[760px]">
          <Kicker className="mb-[14px]">FAQ</Kicker>
          <h1 id="page-title" className={headingClass.h1}>
            Frequently asked questions.
          </h1>
          <p className={`${leadClass} mt-[22px] max-w-[56ch]`}>
            Can&rsquo;t find what you&rsquo;re looking for?{" "}
            <Link href="/contact" className={inlineLinkClass}>
              Get in touch
            </Link>{" "}
            and we&rsquo;ll get back to you.
          </p>
        </Reveal>
      </Section>

      {/* Jump nav */}
      <JumpNav
        ariaLabel="Question groups"
        items={groups.map((group) => ({
          href: `#${group.id}`,
          label: group.label,
          number: group.number,
        }))}
      />

      {/* Question groups */}
      {groups.map((group, index) => (
        <Section
          key={group.id}
          id={group.id}
          aria-labelledby={`${group.id}-title`}
          rule={index > 0}
          className="scroll-mt-[124px] pt-[clamp(48px,6vw,88px)]"
        >
          <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-8">
            <div className="max-w-[400px] min-[761px]:sticky top-[136px]">
              <Kicker className="mb-[14px]">
                <span className="tabular-nums">{group.number}</span> · {group.label}
              </Kicker>
              <h2 id={`${group.id}-title`} className={headingClass.h2}>
                {group.title}
              </h2>
              <p className={`${introClass} mt-4`}>{group.related}</p>
            </div>
            <FaqList items={group.items} openFirst={openFirst} />
          </Reveal>
        </Section>
      ))}

      {/* CTA */}
      <Section variant="cta" aria-labelledby="cta-title">
        <Reveal>
          <CtaPanel
            title="Still have questions?"
            titleId="cta-title"
            primary={{ href: "/contact", label: "Contact us" }}
            secondary={{ href: "/signup", label: "Start free trial" }}
          >
            Ask us directly, or start the trial and scan your first sticker yourself.
          </CtaPanel>
        </Reveal>
      </Section>
    </>
  );
}
