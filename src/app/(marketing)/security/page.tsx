import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CreditCard, Layers, Lock, Mail, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Icon } from "../_components/icon";
import { headingClass, SectionHeader } from "../_components/kicker";
import { Panel } from "../_components/panel";
import { Reveal } from "../_components/reveal";
import { Section } from "../_components/section";

// docs/design/marketing-2026-09/Security.dc.html (README "8. Security").
// The five row titles and texts are the existing copy, kept verbatim.

export const metadata: Metadata = {
  title: "Security",
  description:
    "How EquipQR isolates tenant data, encrypts it, and keeps payment details out of our systems.",
};

type Practice = {
  id: string;
  number: string;
  icon: LucideIcon;
  title: string;
  text: string;
};

const practices: Practice[] = [
  {
    id: "isolation",
    number: "01",
    icon: Layers,
    title: "Tenant isolation by row-level security",
    text: "Every table that holds customer, equipment, or service request data is protected by Postgres row-level security policies scoped to a company ID resolved server-side. One company's data isn't queryable by another — it's enforced at the database layer, not just in application code.",
  },
  {
    id: "encryption",
    number: "02",
    icon: Lock,
    title: "Encrypted in transit and at rest",
    text: "All traffic to EquipQR is served over TLS. Data at rest — including equipment records, guides, and service request photos and video — is encrypted at rest by our infrastructure provider, Supabase.",
  },
  {
    id: "payments",
    number: "03",
    icon: CreditCard,
    title: "No card data touches our servers",
    text: "Subscription payments are handled entirely by Stripe. EquipQR never receives or stores your card number — only a subscription status and a tokenized reference from Stripe.",
  },
  {
    id: "roles",
    number: "04",
    icon: Users,
    title: "Least-privilege team roles",
    text: "Owners and technicians have distinct permissions. Technicians can work equipment, customers, and service requests, but can't touch billing, team membership, or company deletion — so a compromised technician account has a limited blast radius.",
  },
  {
    id: "public",
    number: "05",
    icon: ShieldCheck,
    title: "Public pages expose only what's needed",
    text: "The scan pages your customers see are served through access-controlled database functions that return only what's necessary to show a guide or accept a service request — never a broader view into your account.",
  },
];

// Inline text links (README "Hover": link text → accent-300 / text). Body copy
// never uses the raw accent, so the resting color is accent-300.
const textLinkClass =
  "text-eq-accent-300 underline underline-offset-[3px] transition-colors duration-150 hover:text-eq-text";

const mailHref = `mailto:${SUPPORT_EMAIL}`;

export default function SecurityPage() {
  return (
    <>
      <Section variant="hero" aria-labelledby="page-title" className="pb-[clamp(24px,3vw,40px)]">
        <Reveal>
          <SectionHeader
            size="h1"
            kicker="Trust"
            title="Security"
            titleId="page-title"
            lead="A summary of how EquipQR keeps your data — and your customers' data — isolated and protected."
            className="max-w-[800px]"
            leadClassName="max-w-[56ch]"
          />
        </Reveal>
      </Section>

      <Section aria-label="Security practices" className="pt-[clamp(24px,3vw,48px)]">
        <Reveal className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-[clamp(32px,5vw,80px)] gap-y-10">
          <div className="max-w-[400px] min-[761px]:sticky min-[761px]:top-[88px]">
            <p className="text-[16px] leading-[1.6] text-eq-neutral-400">
              Five things that are true of every account, on every plan.
            </p>
            <nav aria-label="Jump to a practice" className="mt-5">
              <ul className="flex flex-col gap-1.5">
                {practices.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`#${p.id}`}
                      className="-ml-[10px] flex items-center gap-[10px] rounded-md px-[10px] py-2 text-[14.5px] text-eq-neutral-300 transition-colors duration-150 hover:bg-eq-accent-tint-8 hover:text-eq-text"
                    >
                      <span className="text-[12px] text-primary tabular-nums">{p.number}</span>
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="mt-6 text-[13.5px] leading-[1.6] text-eq-neutral-500">
              See also the{" "}
              <Link href="/privacy" className={textLinkClass}>
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" className={textLinkClass}>
                Terms of Service
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-col gap-[14px]">
            {practices.map((p) => (
              <Panel
                key={p.id}
                as="article"
                id={p.id}
                padding="row"
                className="flex scroll-mt-[88px] gap-[18px]"
              >
                <Icon icon={p.icon} size={22} className="mt-[3px] text-primary" />
                <div className="min-w-0">
                  <h2 className="text-[18px] leading-[1.35] tracking-[-0.01em] font-medium">{p.title}</h2>
                  <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.6] text-eq-neutral-400">{p.text}</p>
                </div>
              </Panel>
            ))}
          </div>
        </Reveal>
      </Section>

      <Section variant="cta" aria-labelledby="disclosure-title">
        <Reveal>
          <MailCtaPanel />
        </Reveal>
      </Section>
    </>
  );
}

/**
 * The README final CTA panel with a `mailto:` primary. `CtaPanel` renders its
 * primary as a next/link `Link`; a mail address is not a route, so this is the
 * same box with a plain `<a>` (see notes/ws12.md "Requests").
 */
function MailCtaPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-center gap-x-10 gap-y-7 overflow-hidden rounded-[20px] border border-eq-neutral-900 px-[clamp(24px,5vw,64px)] py-[clamp(36px,5vw,64px)] [background:radial-gradient(760px_380px_at_85%_115%,color-mix(in_srgb,var(--eq-accent-900)_85%,transparent),transparent_62%),var(--eq-surface)]",
        className
      )}
    >
      <div>
        <Icon icon={Mail} size={24} className="mb-4 text-primary" />
        <h2 id="disclosure-title" className={headingClass["h2-sub"]}>
          Found a security issue?
        </h2>
        <p className="mt-[14px] max-w-[50ch] text-[16px] leading-[1.6] text-eq-neutral-400">
          Email{" "}
          <a href={mailHref} className={textLinkClass}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with details and we&apos;ll respond promptly. Please don&apos;t test against other
          customers&apos; accounts or data.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="brand"
          size="xl"
          className="h-[46px] px-5"
          render={<a href={mailHref} />}
          nativeButton={false}
        >
          Report an issue
          <Icon icon={ArrowRight} size={16} data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
