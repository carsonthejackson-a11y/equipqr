import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { headingClass } from "./kicker";

// README "Backgrounds" → Final CTA panel. Just the box: pages render it inside
// `<Section variant="cta" aria-labelledby={titleId}>` and usually a `<Reveal>`.

export type CtaAction = {
  href: string;
  label: React.ReactNode;
};

export type CtaPanelProps = {
  title: React.ReactNode;
  /** Id for the H2; point the enclosing section's `aria-labelledby` at it. */
  titleId?: string;
  /** Supporting copy under the heading. */
  children?: React.ReactNode;
  /** `brand` button with a trailing arrow. */
  primary: CtaAction;
  /** `neutral` button. */
  secondary?: CtaAction;
  /** 13px small print under the buttons. */
  note?: React.ReactNode;
  /** Optional 24px accent icon above the heading (Security's mail icon). */
  icon?: LucideIcon;
  className?: string;
};

export function CtaPanel({ title, titleId, children, primary, secondary, note, icon, className }: CtaPanelProps) {
  return (
    <div
      className={cn(
        "relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-center gap-x-10 gap-y-7 overflow-hidden rounded-[20px] border border-eq-neutral-900 px-[clamp(24px,5vw,64px)] py-[clamp(36px,5vw,64px)] [background:radial-gradient(760px_380px_at_85%_115%,color-mix(in_srgb,var(--eq-accent-900)_85%,transparent),transparent_62%),var(--eq-surface)]",
        className
      )}
    >
      <div>
        {icon ? <Icon icon={icon} size={24} className="mb-4 text-primary" /> : null}
        <h2 id={titleId} className={headingClass["h2-sub"]}>
          {title}
        </h2>
        {children ? (
          <p className="mt-[14px] max-w-[50ch] text-[16px] leading-[1.6] text-eq-neutral-400">{children}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-[14px]">
        <div className="flex flex-wrap gap-3">
          <Button variant="brand" size="xl" className="h-[46px] px-5" render={<Link href={primary.href} />}>
            {primary.label}
            <Icon icon={ArrowRight} size={16} data-icon="inline-end" />
          </Button>
          {secondary ? (
            <Button variant="neutral" size="xl" className="h-[46px] px-5" render={<Link href={secondary.href} />}>
              {secondary.label}
            </Button>
          ) : null}
        </div>
        {note ? <p className="text-[13px] leading-[1.5] text-eq-neutral-500">{note}</p> : null}
      </div>
    </div>
  );
}
