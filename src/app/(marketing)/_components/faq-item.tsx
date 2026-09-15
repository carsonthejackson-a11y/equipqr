import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

// README "Accordion": native <details>/<summary>, 1px neutral-800 rules (no
// card per row), 16px/500 summary with an 18px chevron that rotates when open,
// 15px neutral-400 answer capped at 60ch.

export type FaqEntry = { question: string; answer: string };

export type FaqItemProps = FaqEntry & {
  /** Open on load (FAQ page `openFirst`). */
  open?: boolean;
  className?: string;
};

export function FaqItem({ question, answer, open, className }: FaqItemProps) {
  return (
    <details
      open={open}
      className={cn("group border-t border-eq-neutral-800 last:border-b", className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[18px] text-[16px] leading-[1.4] font-medium text-eq-text transition-colors duration-150 hover:text-eq-accent-300 [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <Icon
          icon={ChevronDown}
          size={18}
          className="text-eq-neutral-500 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <p className="mb-[18px] max-w-[60ch] text-[15px] leading-[1.6] text-eq-neutral-400">{answer}</p>
    </details>
  );
}

export type FaqListProps = {
  items: readonly FaqEntry[];
  /** Open the first item on load. */
  openFirst?: boolean;
  className?: string;
};

export function FaqList({ items, openFirst = false, className }: FaqListProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((item, index) => (
        <FaqItem key={item.question} open={openFirst && index === 0} {...item} />
      ))}
    </div>
  );
}
