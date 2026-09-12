import { describe, expect, it } from "vitest";
import { dashboardNavLinks, isNavLinkActive, navLinksFor, ownerNavLinks } from "./dashboard-nav-links";

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
});
