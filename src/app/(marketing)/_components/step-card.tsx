import { cn } from "@/lib/utils";
import { headingClass } from "./kicker";
import { Panel } from "./panel";

// Numbered step card (Restaurants "Four steps, no phone tree."). Drop into a
// `grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4` grid.

export type StepCardProps = {
  /** Zero-padded label, e.g. "01". */
  number: string;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function StepCard({ number, title, children, className }: StepCardProps) {
  return (
    <Panel className={cn("flex h-full flex-col gap-[14px]", className)}>
      <span className="text-[13px] tracking-[0.06em] text-primary tabular-nums">{number}</span>
      <h3 className={headingClass.h3}>{title}</h3>
      <p className="text-[15px] leading-[1.6] text-eq-neutral-400">{children}</p>
    </Panel>
  );
}
