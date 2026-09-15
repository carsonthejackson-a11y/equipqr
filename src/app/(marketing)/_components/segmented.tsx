"use client";

import { cn } from "@/lib/utils";

// README "Segmented control": real radio inputs inside labels on the surface
// with a 10px radius; the checked option takes the accent inset outline. The
// class strings are exported so the Pricing audience Tabs (Base UI, WS7) can
// look identical: apply `segmentedListClass` to the Tabs.List and
// `segmentedOptionClass(selected)` to each Tabs.Tab.

export const segmentedListClass = "inline-flex flex-wrap rounded-[10px] bg-eq-surface p-0";

export function segmentedOptionClass(checked: boolean): string {
  return cn(
    "relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none",
    // Focus ring for a focusable option itself (Tabs.Tab) and for a label
    // wrapping a visually hidden radio.
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-primary",
    checked
      ? "text-primary shadow-[inset_0_0_0_1px_var(--eq-accent)]"
      : "text-eq-neutral-300 hover:bg-foreground/[0.07] hover:text-eq-text"
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Trailing badge inside the option, e.g. `<Tag size="xs">2 months free</Tag>`. */
  badge?: React.ReactNode;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the radio group. */
  ariaLabel: string;
  /** Radio `name`; unique per control on the page. */
  name: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  name,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(segmentedListClass, className)}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} className={segmentedOptionClass(checked)}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
            {option.badge}
          </label>
        );
      })}
    </div>
  );
}
