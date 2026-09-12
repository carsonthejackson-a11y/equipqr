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
  MapPin,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { CompanyKind } from "@/lib/types";

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

// Owner roadmap (docs/OWNER-ROADMAP-BRIEF.md §3.2): an equipment_owner
// company has no customers, no internal technicians to schedule, and no
// inspections yet, so it gets its own fixed link list instead of filtering
// dashboardNavLinks. "Equipment Types" is kept even though the concept doc's
// nav list didn't literally name it — symptom_chips are edited there, and
// without it an owner has no way to change the chips the onboarding seed
// created.
export const ownerNavLinks: DashboardNavLink[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/locations", label: "Locations", icon: MapPin },
  { href: "/dashboard/equipment", label: "Equipment", icon: HardHat },
  { href: "/dashboard/equipment-types", label: "Equipment Types", icon: Wrench },
  { href: "/dashboard/requests", label: "Work Orders", icon: Inbox },
  { href: "/dashboard/vendors", label: "Vendors", icon: Truck },
  { href: "/dashboard/settings/team", label: "Team", icon: Users2, ownerOnly: true },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard, ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

/** The nav list for a company of this kind — dashboardNavLinks is left untouched (its own test asserts on it). */
export function navLinksFor(kind: CompanyKind): DashboardNavLink[] {
  return kind === "equipment_owner" ? ownerNavLinks : dashboardNavLinks;
}

export const adminNavLink: DashboardNavLink = {
  href: "/admin/qr-codes",
  label: "Admin",
  icon: ShieldCheck,
};

export function isNavLinkActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
