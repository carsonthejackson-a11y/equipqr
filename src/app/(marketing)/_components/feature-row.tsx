import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { headingClass } from "./kicker";
import { Tag } from "./tag";

// README §2 feature row: copy on one side, a static mock on the other. With
// `visualLeft` the mock comes first on desktop and drops under the copy below
// 760px (`data-visual-left` in the design).

export type FeatureRowProps = {
  id?: string;
  title: React.ReactNode;
  /** Copy: plain text or one or more `<p>` elements. */
  children: React.ReactNode;
  /** Plan availability, rendered as an outline tag, e.g. "Pro and above · Kitchen and above". */
  availability?: React.ReactNode;
  /** Optional 24px accent icon before the title. */
  icon?: LucideIcon;
  visual: React.ReactNode;
  visualLeft?: boolean;
  /** Heading element (default h3). */
  titleAs?: "h2" | "h3";
  titleClassName?: string;
  className?: string;
};

export function FeatureRow({
  id,
  title,
  children,
  availability,
  icon,
  visual,
  visualLeft = false,
  titleAs: Title = "h3",
  titleClassName,
  className,
}: FeatureRowProps) {
  return (
    <div
      id={id}
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-center gap-x-[clamp(32px,5vw,80px)] gap-y-8",
        id && "scroll-mt-[124px]",
        className
      )}
    >
      <div>
        <div className="flex flex-wrap items-center gap-3">
          {icon ? <Icon icon={icon} size={24} className="text-primary" /> : null}
          <Title className={cn(headingClass["h3-row"], titleClassName)}>{title}</Title>
          {availability ? <Tag variant="outline">{availability}</Tag> : null}
        </div>
        <div className="mt-4 flex max-w-[52ch] flex-col gap-3 text-[15px] leading-[1.6] text-eq-neutral-400">
          {children}
        </div>
      </div>
      <div
        aria-hidden="true"
        className={cn("flex min-w-0 justify-center", visualLeft && "order-first max-[760px]:order-2")}
      >
        {visual}
      </div>
    </div>
  );
}
