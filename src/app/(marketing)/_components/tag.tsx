import { cn } from "@/lib/utils";

// README "Tags": accent-tinted labels ("Most popular", "Sent", "Acknowledged",
// "2 months free"), neutral outline ("Multi-kitchen" in the owner mock, plan
// availability on feature rows) and a filled neutral (dashboard mock rows).

const tagVariant = {
  accent: "bg-eq-accent-tint-12 text-eq-accent-200",
  outline: "border border-eq-neutral-700 text-eq-neutral-300",
  neutral: "bg-eq-neutral-800 text-eq-neutral-100",
} as const;

const tagSize = {
  sm: "px-2 py-0.5 text-[11px]",
  /** The `2 months free` badge inside the billing toggle. */
  xs: "px-[7px] py-[2px] text-[10.5px]",
} as const;

export type TagProps = React.ComponentProps<"span"> & {
  variant?: keyof typeof tagVariant;
  size?: keyof typeof tagSize;
};

export function Tag({ variant = "accent", size = "sm", className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full font-medium leading-[1.3] whitespace-nowrap",
        tagVariant[variant],
        tagSize[size],
        className
      )}
      {...props}
    />
  );
}
