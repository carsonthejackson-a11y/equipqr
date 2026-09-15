import { cn } from "@/lib/utils";
import { Container } from "./container";

// README "Spacing and layout" vertical rhythm.
const sectionPadding = {
  /** Page hero: generous top, standard section bottom. */
  hero: "pt-[clamp(56px,7vw,104px)] pb-[clamp(40px,5vw,72px)]",
  /** Between sections. */
  default: "pt-[clamp(40px,5vw,72px)] pb-[clamp(24px,3vw,48px)]",
  /** Final CTA section: extra room above the footer. */
  cta: "pt-[clamp(32px,4vw,64px)] pb-[clamp(72px,9vw,128px)]",
} as const;

export type SectionVariant = keyof typeof sectionPadding;

export type SectionProps = Omit<React.ComponentProps<"section">, "children"> & {
  variant?: SectionVariant;
  /** Faded divider (`.eq-rule`) at the top of the section, inside the container. */
  rule?: boolean;
  /** Extra classes for the inner Container (e.g. a grid). */
  containerClassName?: string;
  /** Skip the inner Container for full-bleed content. */
  bleed?: boolean;
  children: React.ReactNode;
};

/**
 * A marketing `<section>` with the README vertical rhythm. Pass `id` for
 * in-page anchors (adds `scroll-mt-20` for the sticky header); pages with a
 * jump nav should override with `scroll-mt-[124px]`. Give every section an
 * `aria-labelledby` (the heading id) or an `aria-label`.
 */
export function Section({
  variant = "default",
  rule = false,
  containerClassName,
  bleed = false,
  className,
  id,
  children,
  ...props
}: SectionProps) {
  const body = (
    <>
      {rule ? <div className="eq-rule mb-[clamp(40px,5vw,72px)]" aria-hidden="true" /> : null}
      {children}
    </>
  );
  return (
    <section
      id={id}
      className={cn(sectionPadding[variant], id && "scroll-mt-20", className)}
      {...props}
    >
      {bleed ? body : <Container className={containerClassName}>{body}</Container>}
    </section>
  );
}
