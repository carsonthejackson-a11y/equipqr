import { cn } from "@/lib/utils";

// README "Typography" scale. Headings are always weight 500; never bolder.
export const headingClass = {
  /** Page H1. */
  h1: "text-[clamp(36px,4.4vw,58px)] leading-[1.06] tracking-[-0.025em] font-medium",
  /** Home hero H1 (slightly larger). */
  "h1-hero": "text-[clamp(38px,4.8vw,62px)] leading-[1.04] tracking-[-0.025em] font-medium",
  /** Section H2. */
  h2: "text-[clamp(28px,3.2vw,40px)] leading-[1.12] tracking-[-0.02em] font-medium",
  /** Features "Outcome" H2. */
  "h2-outcome": "text-[clamp(32px,3.8vw,48px)] leading-[1.08] tracking-[-0.025em] font-medium",
  /** Sub-section H2 (staff/owner view, CTA panels). */
  "h2-sub": "text-[clamp(26px,3vw,38px)] leading-[1.12] tracking-[-0.02em] font-medium",
  /** Restaurants story / how-it-works H2. */
  "h2-story": "text-[clamp(30px,3.4vw,44px)] leading-[1.1] tracking-[-0.02em] font-medium",
  /** Card title H3. */
  h3: "text-[19px] leading-[1.3] tracking-[-0.01em] font-medium",
  /** Feature-row / icon-row H3. */
  "h3-row": "text-[16px] leading-[1.4] font-medium",
} as const;

export type HeadingSize = keyof typeof headingClass;

/** Lead paragraph under an H1. */
export const leadClass = "text-[clamp(16px,1.3vw,18px)] leading-[1.6] text-eq-neutral-300";
/** Intro paragraph under a section H2. */
export const introClass = "text-[16px] leading-[1.6] text-eq-neutral-400";
/** Kicker label above a heading. */
export const kickerClass = "text-[13px] font-medium uppercase tracking-[0.06em] text-primary";

export function Kicker({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn(kickerClass, className)} {...props} />;
}

export type SectionHeaderProps = {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  /** Id for the heading; point the section's `aria-labelledby` at it. */
  titleId?: string;
  /** Paragraph under the heading: lead style for `h1`, intro style otherwise. */
  lead?: React.ReactNode;
  size?: HeadingSize;
  /** Heading element. Defaults to `h1` for the h1 sizes and `h2` otherwise. */
  as?: "h1" | "h2" | "h3";
  align?: "start" | "center";
  className?: string;
  titleClassName?: string;
  leadClassName?: string;
  /** Extra content under the lead (links, buttons). */
  children?: React.ReactNode;
};

/**
 * Kicker + heading + lead, the block at the top of every section. Defaults to
 * `max-w-[640px]`; pass `className` to change the measure or margins.
 */
export function SectionHeader({
  kicker,
  title,
  titleId,
  lead,
  size = "h2",
  as,
  align = "start",
  className,
  titleClassName,
  leadClassName,
  children,
}: SectionHeaderProps) {
  const isH1 = size === "h1" || size === "h1-hero";
  const Heading = as ?? (isH1 ? "h1" : "h2");
  return (
    <div className={cn("max-w-[640px]", align === "center" && "mx-auto text-center", className)}>
      {kicker ? <Kicker className="mb-[14px]">{kicker}</Kicker> : null}
      <Heading id={titleId} className={cn(headingClass[size], titleClassName)}>
        {title}
      </Heading>
      {lead ? (
        <p className={cn(isH1 ? cn(leadClass, "mt-[22px]") : cn(introClass, "mt-4"), leadClassName)}>
          {lead}
        </p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
