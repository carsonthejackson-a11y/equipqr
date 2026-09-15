import Link from "next/link";
import { cn } from "@/lib/utils";
import { Section } from "./section";
import { SectionHeader } from "./kicker";

// README "Screens → 9. Terms / 10. Privacy": the shared legal layout. Hero
// (kicker "Legal", H1, lead, "Last updated"), then a two-column body with a
// sticky numbered contents list on the left and the numbered sections on the
// right, closed by the "not legal advice" notice (behind `showNotice`).

export type LegalSection = {
  /** Anchor id; the contents list links to `#id`. */
  id: string;
  title: string;
  /** One or more `<p>` / `<ul>` blocks; the layout spaces them 12px apart. */
  body: React.ReactNode;
};

export type LegalLink = { href: string; label: string };

export type LegalLayoutProps = {
  title: string;
  /** Lead paragraph under the H1. */
  description: string;
  /** e.g. "September 3, 2026". */
  lastUpdated: string;
  sections: LegalSection[];
  /** Render the bottom "Note: … not legal advice" panel. Default true. */
  showNotice?: boolean;
  /** The other trust pages, rendered as "See also the A and B." under the contents. */
  seeAlso: LegalLink[];
};

const linkClass =
  "text-primary underline decoration-1 underline-offset-[3px] transition-colors duration-150 hover:text-eq-accent-300";

/** Inline path chip (`/e/`): README "Typography" monospace, 0.9em, surface, neutral-900 border, 5px radius. */
export function Code({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded-[5px] border border-eq-neutral-900 bg-eq-surface px-1.5 py-px font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-[0.9em] text-eq-text",
        className
      )}
      {...props}
    />
  );
}

/** Joins the "See also" links as "the A and B." / "the A, B and C." */
function SeeAlso({ links }: { links: LegalLink[] }) {
  if (links.length === 0) return null;
  return (
    <p className="mt-5 text-[13.5px] leading-[1.6] text-eq-neutral-500">
      See also the{" "}
      {links.map((link, i) => (
        <span key={link.href}>
          {i > 0 ? (i === links.length - 1 ? " and " : ", ") : null}
          <Link href={link.href} className={linkClass}>
            {link.label}
          </Link>
        </span>
      ))}
      .
    </p>
  );
}

export function LegalLayout({
  title,
  description,
  lastUpdated,
  sections,
  showNotice = true,
  seeAlso,
}: LegalLayoutProps) {
  return (
    <>
      <Section
        variant="hero"
        aria-labelledby="page-title"
        className="pb-[clamp(24px,3vw,40px)]"
      >
        <SectionHeader
          kicker="Legal"
          size="h1"
          title={title}
          titleId="page-title"
          lead={description}
          className="max-w-[760px]"
          leadClassName="max-w-[56ch]"
        >
          <p className="text-sm text-eq-neutral-500 tabular-nums">Last updated {lastUpdated}</p>
        </SectionHeader>
      </Section>

      <Section
        variant="cta"
        aria-label={title}
        className="pt-[clamp(24px,3vw,48px)]"
        containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-start gap-[40px_clamp(32px,5vw,80px)]"
      >
        <nav aria-label="Sections" className="max-w-[360px] min-[761px]:sticky min-[761px]:top-[88px]">
          <p className="mb-3 text-xs uppercase tracking-[0.08em] text-eq-neutral-500">Contents</p>
          <ol className="flex flex-col gap-0.5">
            {sections.map((section, i) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-2.5 flex gap-2.5 rounded-md px-2.5 py-[7px] text-sm leading-[1.4] text-eq-neutral-300 transition-colors duration-150 hover:bg-eq-accent-tint-8 hover:text-eq-text"
                >
                  <span className="mt-0.5 min-w-4 flex-none text-xs text-primary tabular-nums">
                    {i + 1}
                  </span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
          <SeeAlso links={seeAlso} />
        </nav>

        <div className="flex max-w-[68ch] flex-col gap-[clamp(28px,3vw,40px)] text-base leading-[1.7] text-eq-neutral-300">
          {sections.map((section, i) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-[88px]"
            >
              <h2
                id={`${section.id}-title`}
                className="mb-3 flex gap-3 text-[clamp(20px,1.8vw,24px)] leading-[1.3] font-medium tracking-[-0.015em] text-eq-text"
              >
                <span className="text-primary tabular-nums">{`${i + 1}.`}</span>
                {section.title}
              </h2>
              <div
                className={cn(
                  "flex flex-col gap-3",
                  "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-[22px]",
                  "[&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.5 [&_ol]:pl-[22px]",
                  "[&_strong]:font-medium [&_strong]:text-eq-text",
                  "[&_a]:text-primary [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[3px] [&_a]:transition-colors [&_a]:duration-150 [&_a:hover]:text-eq-accent-300"
                )}
              >
                {section.body}
              </div>
            </section>
          ))}

          {showNotice ? (
            <p className="mt-2 rounded-[12px] border border-eq-neutral-900 bg-eq-surface px-[18px] py-4 text-sm leading-[1.6] text-eq-neutral-400">
              <strong className="font-medium text-eq-text">Note:</strong> this page is a general
              template provided for convenience and does not constitute legal advice. Have a
              qualified attorney review it before relying on it for your business.
            </p>
          ) : null}
        </div>
      </Section>
    </>
  );
}
