"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CompanyKind } from "@/lib/types";

const items = [
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/settings/team", label: "Team" },
  { href: "/dashboard/settings/billing", label: "Billing" },
  { href: "/dashboard/settings/account", label: "Account" },
  { href: "/dashboard/settings/branding", label: "Branding" },
  // No owner plan includes API access today, so "View plans" from this tab
  // would lead nowhere for an equipment_owner company — hidden for that
  // kind rather than shown with a broken upsell (C1-06).
  { href: "/dashboard/settings/api", label: "API", ownerKindOnly: true },
  { href: "/dashboard/settings/qr-codes", label: "Blank codes" },
  { href: "/dashboard/settings/custom-fields", label: "Custom fields" },
];

// Unlike the main dashboard nav, "/dashboard/settings" (company settings) is
// a leaf here too, not a section prefix that Team/Billing/Account also fall
// under — so it needs an exact match rather than dashboard-nav-links'
// isNavLinkActive() prefix rule, or it would light up on every subpage.
function isActive(pathname: string, href: string) {
  return href === "/dashboard/settings" ? pathname === href : pathname.startsWith(href);
}

export function SettingsSubnavClient({ kind }: { kind: CompanyKind }) {
  const pathname = usePathname();
  const visible = items.filter((item) => !(item.ownerKindOnly && kind === "equipment_owner"));

  return (
    <nav className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visible.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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
