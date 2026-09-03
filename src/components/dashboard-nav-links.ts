import {
  LayoutGrid,
  Users,
  Wrench,
  HardHat,
  Inbox,
  Settings,
  CreditCard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const dashboardNavLinks: DashboardNavLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/equipment-types", label: "Equipment Types", icon: Wrench },
  { href: "/dashboard/equipment", label: "Equipment", icon: HardHat },
  { href: "/dashboard/requests", label: "Requests", icon: Inbox },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard },
];

export const adminNavLink: DashboardNavLink = {
  href: "/admin/qr-codes",
  label: "Admin",
  icon: ShieldCheck,
};

export function isNavLinkActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
