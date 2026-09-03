"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLink, dashboardNavLinks, isNavLinkActive } from "@/components/dashboard-nav-links";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

export function DashboardNav({ isAdmin = false, role }: { isAdmin?: boolean; role: UserRole }) {
  const pathname = usePathname();
  const visibleLinks = dashboardNavLinks.filter((link) => !link.ownerOnly || role === "owner");
  const links = isAdmin ? [...visibleLinks, adminNavLink] : visibleLinks;

  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = isNavLinkActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
