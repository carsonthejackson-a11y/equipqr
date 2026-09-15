import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

// "All features →" style link: the Button `ghost` variant in accent with a
// trailing 16px arrow and no border (README "Buttons" btn-ghost). The hover
// overrides replace ghost's muted background/foreground swap so the link stays
// green; `dark:` is needed because the marketing root carries `dark`.

export type GhostLinkProps = Omit<React.ComponentProps<typeof Link>, "children"> & {
  children: React.ReactNode;
  className?: string;
};

export function GhostLink({ children, className, ...linkProps }: GhostLinkProps) {
  return (
    <Button
      variant="ghost"
      size="lg"
      className={cn(
        "h-[42px] px-3 text-sm text-primary hover:bg-eq-accent-tint-12 hover:text-primary active:bg-eq-accent-tint-16 dark:hover:bg-eq-accent-tint-12",
        className
      )}
      render={<Link {...linkProps} />}
    >
      {children}
      <Icon icon={ArrowRight} size={16} data-icon="inline-end" />
    </Button>
  );
}
