import type { LucideIcon, LucideProps } from "lucide-react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Marketing icon wrapper (docs/design/marketing-2026-09/BRIEF.md D5 "Icons").
// Every icon in the design is a 24-viewBox, 1.75-stroke, square-cap,
// miter-join line icon; checks are stroke 2. Sizes: 16 inline in lists and
// buttons, 18 table marks, 22 feature-row leaders, 24 section leads.

export type IconSize = 16 | 18 | 22 | 24;

export type IconProps = Omit<LucideProps, "size" | "strokeWidth" | "ref"> & {
  /** Any `lucide-react` icon component, e.g. `ArrowRight`. */
  icon: LucideIcon;
  size?: IconSize;
  /** Check marks use the heavier 2px stroke. */
  check?: boolean;
};

/**
 * Renders a Lucide icon in the design's square-cap language. Decorative by
 * default (`aria-hidden`); pass `aria-label` to expose it as an image, e.g.
 * the compare table's "Included" / "Not included" marks.
 */
export function Icon({ icon: LucideGlyph, size = 16, check = false, className, ...props }: IconProps) {
  const labelled = Boolean(props["aria-label"] || props["aria-labelledby"]);
  return (
    <LucideGlyph
      size={size}
      strokeWidth={check ? 2 : 1.75}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

export type MarkIconProps = Omit<IconProps, "icon" | "check">;

/** Accent check for feature lists and table "Included" marks (`aria-label="Included"`). */
export function CheckIcon(props: MarkIconProps) {
  return <Icon icon={Check} check {...props} />;
}

/** Neutral X for table "Not included" marks (`aria-label="Not included"`). */
export function XIcon(props: MarkIconProps) {
  return <Icon icon={X} check {...props} />;
}
