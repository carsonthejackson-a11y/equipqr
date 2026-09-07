import {
  LayoutGrid,
  Users,
  Users2,
  Wrench,
  HardHat,
  Inbox,
  CalendarDays,
  ClipboardCheck,
  Settings,
  CreditCard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Hidden from technicians — only rendered when the viewer is an owner.
  ownerOnly?: boolean;
};

export const dashboardNavLinks: DashboardNavLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/equipment-types", label: "Equipment Types", icon: Wrench },
  { href: "/dashboard/equipment", label: "Equipment", icon: HardHat },
  { href: "/dashboard/requests", label: "Requests", icon: Inbox },
  // Next roadmap: scheduling-lite (+ PM schedules live under /dashboard/maintenance, linked from Schedule).
  { href: "/dashboard/schedule", label: "Schedule", icon: CalendarDays },
  // Next roadmap: checklist templates + inspections.
  { href: "/dashboard/checklists", label: "Checklists", icon: ClipboardCheck },
  { href: "/dashboard/settings/team", label: "Team", icon: Users2, ownerOnly: true },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard, ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, ownerOnly: true },
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
