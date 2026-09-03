import { describe, expect, it } from "vitest";
import { isNavLinkActive } from "./dashboard-nav-links";

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
