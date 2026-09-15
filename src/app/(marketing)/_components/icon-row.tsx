import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon, type IconSize } from "./icon";

// Icon leader + title + copy (Home capability grid, Restaurants "For the
// owner" rows, About facts). 22px accent icon by default, 24 for section leads.

export type IconRowProps = {
  icon: LucideIcon;
  title: React.ReactNode;
  children?: React.ReactNode;
  size?: IconSize;
  /** Heading element; use `div` where the row is not a real sub-heading. */
  titleAs?: "h3" | "h4" | "div";
  className?: string;
};

export function IconRow({ icon, title, children, size = 22, titleAs: Title = "h3", className }: IconRowProps) {
  return (
    <div className={cn("flex gap-[14px]", className)}>
      <Icon icon={icon} size={size} className="mt-[2px] text-primary" />
      <div className="min-w-0">
        <Title className="text-[16px] leading-[1.4] font-medium">{title}</Title>
        {children ? (
          <p className="mt-1 max-w-[50ch] text-[14.5px] leading-[1.55] text-eq-neutral-400">{children}</p>
        ) : null}
      </div>
    </div>
  );
}
