"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLink, navLinksFor, activeNavHref } from "@/components/dashboard-nav-links";
import { cn } from "@/lib/utils";
import type { CompanyKind, UserRole } from "@/lib/types";
import { FEATURES } from "@/lib/features";

export function DashboardTopNav({
  isAdmin = false,
  role,
  kind,
  requestsBadgeCount = 0,
}: {
  isAdmin?: boolean;
  role: UserRole;
  kind: CompanyKind;
  /** Open (status "new") or unread-message request count — Requests/Work Orders pill only (docs/QOL-CONTINUITY-BRIEF.md §2, Q-32). */
  requestsBadgeCount?: number;
}) {
  const pathname = usePathname();
  const visibleLinks = navLinksFor(kind).filter((link) => !link.ownerOnly || role === "owner");
  const links = isAdmin && FEATURES.batchQr ? [...visibleLinks, adminNavLink] : visibleLinks;
  const activeHref = activeNavHref(pathname, links);

  const pillRefs = useRef(new Map<string, HTMLAnchorElement>());

  // Q-49: this row scrolls sideways at 390px, so a deep link (or just a long
  // link list) can leave the active pill off-screen — bring it into view
  // instead of making the rider hunt for it. Guarded for environments
  // without scrollIntoView (e.g. jsdom) even though no test renders this
  // component today.
  useEffect(() => {
    if (!activeHref) return;
    const el = pillRefs.current.get(activeHref);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeHref]);

  return (
    <nav className="flex gap-1.5 overflow-x-auto border-b bg-muted/20 px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden print:hidden md:hidden">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        const badge = href === "/dashboard/requests" ? requestsBadgeCount : 0;
        return (
          <Link
            key={href}
            href={href}
            ref={(el) => {
              if (el) pillRefs.current.set(href, el);
              else pillRefs.current.delete(href);
            }}
            className={cn(
              // Q-49: pills are a 44px target, not just a 44px row — min-h
              // (not h-) so the badge never gets clipped if it wraps to 2 lines.
              "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {badge > 0 && (
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                  active ? "bg-primary-foreground/25 text-primary-foreground" : "bg-primary text-primary-foreground"
                )}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
