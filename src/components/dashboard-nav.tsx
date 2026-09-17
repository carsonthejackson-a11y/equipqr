"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLink, navLinksFor, activeNavHref } from "@/components/dashboard-nav-links";
import { cn } from "@/lib/utils";
import type { CompanyKind, UserRole } from "@/lib/types";
import { FEATURES } from "@/lib/features";

export function DashboardNav({
  isAdmin = false,
  role,
  kind,
  requestsBadgeCount = 0,
}: {
  isAdmin?: boolean;
  role: UserRole;
  kind: CompanyKind;
  /** Open (status "new") or unread-message request count — Requests link only (docs/QOL-CONTINUITY-BRIEF.md §2, Q-32). */
  requestsBadgeCount?: number;
}) {
  const pathname = usePathname();
  const visibleLinks = navLinksFor(kind).filter((link) => !link.ownerOnly || role === "owner");
  const links = isAdmin && FEATURES.batchQr ? [...visibleLinks, adminNavLink] : visibleLinks;
  const activeHref = activeNavHref(pathname, links);

  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        const badge = href === "/dashboard/requests" ? requestsBadgeCount : 0;
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
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
