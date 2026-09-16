import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "visits", href: "/dashboard/schedule", label: "Visits" },
  { key: "maintenance", href: "/dashboard/maintenance", label: "Maintenance" },
] as const;

/**
 * Q-36/Q-37: a shared route-level tab header between /dashboard/schedule
 * ("Visits") and /dashboard/maintenance, replacing the one-off text link
 * each page used to point at the other. Plain <Link>s styled to match
 * TabsList/TabsTrigger's default look (src/components/ui/tabs.tsx) rather
 * than that primitive itself — base-ui's Tabs switches same-page panels by
 * value, and this switches between two separate routes, so a server
 * component page can render it with no client-side state at all.
 */
export function VisitsMaintenanceTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Visits and maintenance" className="inline-flex h-8 w-fit items-center gap-[3px] rounded-lg bg-muted p-[3px] text-muted-foreground">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
            active === tab.key
              ? "bg-background text-foreground shadow-sm dark:bg-input/30"
              : "text-foreground/60 hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
