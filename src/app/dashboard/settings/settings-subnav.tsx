"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/settings/team", label: "Team" },
  { href: "/dashboard/settings/billing", label: "Billing" },
  { href: "/dashboard/settings/account", label: "Account" },
];

// Unlike the main dashboard nav, "/dashboard/settings" (company settings) is
// a leaf here too, not a section prefix that Team/Billing/Account also fall
// under — so it needs an exact match rather than dashboard-nav-links'
// isNavLinkActive() prefix rule, or it would light up on every subpage.
function isActive(pathname: string, href: string) {
  return href === "/dashboard/settings" ? pathname === href : pathname.startsWith(href);
}

export function SettingsSubnav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
