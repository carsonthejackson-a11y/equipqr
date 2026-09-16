import { describe, expect, it } from "vitest";
import { activeNavHref, dashboardNavLinks, isNavLinkActive, navLinksFor, ownerNavLinks } from "./dashboard-nav-links";

describe("isNavLinkActive", () => {
  it("matches the dashboard overview link only on an exact path", () => {
    expect(isNavLinkActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavLinkActive("/dashboard/customers", "/dashboard")).toBe(false);
  });

  it("matches a nested link on an exact path", () => {
    expect(isNavLinkActive("/dashboard/customers", "/dashboard/customers")).toBe(true);
  });

  it("matches a nested link on any of its sub-paths", () => {
    expect(isNavLinkActive("/dashboard/customers/123", "/dashboard/customers")).toBe(true);
    expect(isNavLinkActive("/dashboard/equipment/abc/label", "/dashboard/equipment")).toBe(true);
  });

  it("does not match a sibling link that merely shares a prefix", () => {
    expect(isNavLinkActive("/dashboard/equipment-types", "/dashboard/equipment")).toBe(false);
  });

  it("does not match an unrelated path", () => {
    expect(isNavLinkActive("/login", "/dashboard/customers")).toBe(false);
  });
});

describe("navLinksFor", () => {
  it("gives an equipment_owner company Locations, Vendors and Work Orders, and hides Customers/Schedule/Checklists", () => {
    const labels = navLinksFor("equipment_owner").map((link) => link.label);
    expect(labels).toContain("Locations");
    expect(labels).toContain("Vendors");
    expect(labels).toContain("Work Orders");
    expect(labels).not.toContain("Customers");
    expect(labels).not.toContain("Schedule");
    expect(labels).not.toContain("Checklists");
  });

  it("keeps ownerNavLinks and navLinksFor('equipment_owner') the same list", () => {
    expect(navLinksFor("equipment_owner")).toBe(ownerNavLinks);
  });

  it("deep-equals dashboardNavLinks for a service_provider company", () => {
    expect(navLinksFor("service_provider")).toEqual(dashboardNavLinks);
  });

  it("owner kind has no Today link (§2: 'Owner kind keeps its current set (no Today)')", () => {
    expect(navLinksFor("equipment_owner").map((link) => link.label)).not.toContain("Today");
  });
});

// docs/QOL-CONTINUITY-BRIEF.md §2 (Q-32): Overview · Today · Requests ·
// Schedule · Equipment · Customers · Checklists — then setup: Equipment
// Types · Team · Billing · Settings.
describe("dashboardNavLinks order", () => {
  it("matches the brief's exact provider order", () => {
    expect(dashboardNavLinks.map((link) => link.label)).toEqual([
      "Overview",
      "Today",
      "Requests",
      "Schedule",
      "Equipment",
      "Customers",
      "Checklists",
      "Equipment Types",
      "Team",
      "Billing",
      "Settings",
    ]);
  });

  it("Today links to /dashboard/today and carries no ownerOnly flag", () => {
    const today = dashboardNavLinks.find((link) => link.label === "Today");
    expect(today?.href).toBe("/dashboard/today");
    expect(today?.ownerOnly).toBeFalsy();
  });

  it("Requests and Work Orders (owner kind) share the same href for the badge to key off of", () => {
    const requests = dashboardNavLinks.find((link) => link.href === "/dashboard/requests");
    const workOrders = ownerNavLinks.find((link) => link.href === "/dashboard/requests");
    expect(requests?.label).toBe("Requests");
    expect(workOrders?.label).toBe("Work Orders");
  });
});

describe("activeNavHref (Q-09)", () => {
  const links = [{ href: "/dashboard/settings" }, { href: "/dashboard/settings/billing" }, { href: "/dashboard" }];

  it("picks the longest (most specific) matching href, not the first one", () => {
    expect(activeNavHref("/dashboard/settings/billing", links)).toBe("/dashboard/settings/billing");
  });

  it("still matches the shorter href on its own sub-pages", () => {
    expect(activeNavHref("/dashboard/settings/branding", links)).toBe("/dashboard/settings");
  });

  it("returns null when nothing matches", () => {
    expect(activeNavHref("/login", links)).toBeNull();
  });

  it("is order-independent — same result regardless of list order", () => {
    const reversed = [...links].reverse();
    expect(activeNavHref("/dashboard/settings/billing", reversed)).toBe("/dashboard/settings/billing");
  });
});
