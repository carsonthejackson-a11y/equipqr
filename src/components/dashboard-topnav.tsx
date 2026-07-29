"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardNavLinks, isNavLinkActive } from "@/components/dashboard-nav-links";
import { cn } from "@/lib/utils";

export function DashboardTopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1.5 overflow-x-auto border-b bg-muted/20 px-4 py-2 print:hidden md:hidden">
      {dashboardNavLinks.map(({ href, label, icon: Icon }) => {
        const active = isNavLinkActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
