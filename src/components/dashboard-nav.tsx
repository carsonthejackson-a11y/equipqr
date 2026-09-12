"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLink, navLinksFor, isNavLinkActive } from "@/components/dashboard-nav-links";
import { cn } from "@/lib/utils";
import type { CompanyKind, UserRole } from "@/lib/types";
import { FEATURES } from "@/lib/features";

export function DashboardNav({
  isAdmin = false,
  role,
  kind,
}: {
  isAdmin?: boolean;
  role: UserRole;
  kind: CompanyKind;
}) {
  const pathname = usePathname();
  const visibleLinks = navLinksFor(kind).filter((link) => !link.ownerOnly || role === "owner");
  const links = isAdmin && FEATURES.batchQr ? [...visibleLinks, adminNavLink] : visibleLinks;

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
