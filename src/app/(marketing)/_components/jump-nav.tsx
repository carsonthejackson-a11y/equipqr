import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "./container";
import { Icon } from "./icon";

// Sticky pill nav under the header (Features "Outcomes", FAQ "Jump to").
// README §2/§5: `top: 64px; z-index: 40`, header blur treatment, 1px divider
// borders; pills 34px tall with the number in accent. Sections it targets need
// `scroll-mt-[124px]` (header + nav).

export type JumpNavItem = {
  href: string;
  label: React.ReactNode;
  /** Leading numeral, e.g. "01". */
  number?: string;
};

export type JumpNavProps = {
  /** Visible label before the pills; hidden ≤ 720px. */
  label?: React.ReactNode;
  items: readonly JumpNavItem[];
  /** Accessible name for the `<nav>`. */
  ariaLabel?: string;
  /** Optional trailing text link, right-aligned on wide screens (hidden ≤ 1040px). */
  aside?: { href: string; label: React.ReactNode };
  className?: string;
};

export const jumpNavPillClass =
  "inline-flex h-[34px] shrink-0 items-center gap-2 rounded-full border border-eq-neutral-800 px-3 text-[13px] whitespace-nowrap text-eq-neutral-300 transition-colors duration-150 hover:border-primary hover:bg-eq-accent-tint-8 hover:text-eq-text";

export function JumpNav({ label = "Jump to", items, ariaLabel = "Jump to", aside, className }: JumpNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "sticky top-16 z-40 border-y border-eq-divider bg-[color-mix(in_srgb,var(--eq-bg)_84%,transparent)] backdrop-blur-[14px]",
        className
      )}
    >
      <Container className="flex flex-wrap items-center gap-x-[6px] gap-y-2 py-[10px] max-[720px]:flex-nowrap max-[720px]:overflow-x-auto max-[720px]:[scrollbar-width:none] max-[720px]:[&::-webkit-scrollbar]:hidden">
        {label ? (
          <span className="mr-2 text-[12px] uppercase tracking-[0.06em] text-eq-neutral-500 max-[720px]:hidden">
            {label}
          </span>
        ) : null}
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={jumpNavPillClass}>
            {item.number ? <span className="text-primary tabular-nums">{item.number}</span> : null}
            {item.label}
          </Link>
        ))}
        {aside ? (
          <Link
            href={aside.href}
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-[14px] text-[13.5px] whitespace-nowrap text-eq-neutral-400 transition-colors duration-150 hover:text-eq-text max-[1040px]:hidden"
          >
            {aside.label}
            <Icon icon={ArrowRight} size={16} className="size-[14px]" />
          </Link>
        ) : null}
      </Container>
    </nav>
  );
}
