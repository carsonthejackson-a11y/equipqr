import { cn } from "@/lib/utils";

// README "Elevation" / "Backgrounds": the default card is a 1px neutral-900
// border on the surface, no shadow, hover border neutral-700. The highlighted
// card (Pro / Kitchen) gets an accent border, the 4px accent ring over
// shadow-md and the accent-900 glow.

const panelPadding = {
  /** Plan and step cards. */
  card: "p-[clamp(22px,3vw,28px)]",
  /** Security rows. */
  row: "p-[clamp(20px,3vw,26px)]",
  none: "",
} as const;

export const panelHighlightClass =
  "border-primary shadow-[0_0_0_4px_var(--eq-accent-tint-9),var(--eq-shadow-md)] [background:radial-gradient(420px_240px_at_50%_-80px,color-mix(in_srgb,var(--eq-accent-900)_70%,transparent),transparent_70%),var(--eq-surface)]";

export type PanelProps = Omit<React.ComponentProps<"div">, "ref"> & {
  as?: "div" | "article" | "li" | "section" | "figure";
  padding?: keyof typeof panelPadding;
  highlighted?: boolean;
  /** Border lifts to neutral-700 on hover (off for static mocks). */
  hover?: boolean;
};

export function Panel({
  as = "div",
  padding = "card",
  highlighted = false,
  hover = true,
  className,
  ...props
}: PanelProps) {
  // Widening the intrinsic-tag union keeps one props type for every element.
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={cn(
        "rounded-xl border",
        panelPadding[padding],
        highlighted
          ? panelHighlightClass
          : cn("border-eq-neutral-900 bg-eq-surface", hover && "transition-colors duration-200 hover:border-eq-neutral-700"),
        className
      )}
      {...props}
    />
  );
}
