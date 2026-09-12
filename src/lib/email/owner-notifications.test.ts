import { describe, expect, it, vi } from "vitest";

// Both modules under test import layout.ts, which is `import "server-only"`-
// tagged; vitest runs it under Node, not React's "react-server" condition,
// so the real package would throw. Same fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

import {
  buildOwnerDispatchUpdateEmail,
  buildOwnerNewRequestEmail,
  buildOwnerNoVendorEmail,
} from "./owner-notifications";
import { buildDispatchSlaAlertEmail } from "./dispatch-sla";

const COMMON = {
  equipmentName: "Ice machine",
  locationName: "Downtown",
  reporterName: "Jamie Cook",
  reporterPhone: "555-0100",
  priorityLabel: "High",
  symptoms: ["Not making ice"],
  description: "Bin is empty",
};

describe("buildOwnerNewRequestEmail / buildOwnerNoVendorEmail", () => {
  it("gives the no-vendor email a different subject than the dispatched one", () => {
    const dispatched = buildOwnerNewRequestEmail({
      ...COMMON,
      vendorName: "Metro Refrigeration",
      vendorPhone: "555-0199",
      requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
    });
    const noVendor = buildOwnerNoVendorEmail({
      ...COMMON,
      equipmentUrl: "https://app.equipqr.com/dashboard/equipment/e1",
    });

    expect(dispatched.subject).not.toBe(noVendor.subject);
    expect(dispatched.subject).toContain("sent to Metro Refrigeration");
    expect(noVendor.subject).toContain("no vendor on file");
  });

  it("the dispatched email names the vendor and links to the request", () => {
    const { html, text } = buildOwnerNewRequestEmail({
      ...COMMON,
      vendorName: "Metro Refrigeration",
      vendorPhone: "555-0199",
      requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
    });
    expect(html).toContain("Metro Refrigeration");
    expect(text).toContain("/dashboard/requests/r1");
  });

  it("the no-vendor email says nothing was dispatched", () => {
    const { html } = buildOwnerNoVendorEmail({
      ...COMMON,
      equipmentUrl: "https://app.equipqr.com/dashboard/equipment/e1",
    });
    expect(html).toContain("No vendor is assigned");
  });
});

describe("buildOwnerDispatchUpdateEmail", () => {
  it("renders the ETA in the given timezone and includes the vendor's past-tense action", () => {
    const { subject, html } = buildOwnerDispatchUpdateEmail({
      vendorName: "Metro Refrigeration",
      action: "eta",
      equipmentName: "Ice machine",
      locationName: "Downtown",
      etaAt: "2027-03-01T20:00:00Z",
      timeZone: "America/Denver",
      requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
    });
    expect(subject).toContain("Metro Refrigeration");
    expect(subject).toContain("gave an ETA");
    expect(html).toContain("ETA");
  });

  it("includes the decline reason when present", () => {
    const { html } = buildOwnerDispatchUpdateEmail({
      vendorName: "Metro Refrigeration",
      action: "decline",
      equipmentName: "Ice machine",
      locationName: null,
      declineReason: "Not our service area",
      timeZone: "UTC",
      requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
    });
    expect(html).toContain("Not our service area");
  });
});

describe("buildDispatchSlaAlertEmail", () => {
  it("puts the vendor's phone number in the first line of the body", () => {
    const { html, text } = buildDispatchSlaAlertEmail({
      vendorName: "Metro Refrigeration",
      vendorPhone: "555-0199",
      equipmentName: "Ice machine",
      locationName: "Downtown",
      minutesOverdue: 185,
      priorityLabel: "High",
      requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
    });

    // renderEmailText() always puts `heading` on line 0 and a blank
    // separator on line 1 (see layout.ts) — "leads the body" means the first
    // line *after* that, not literally the first line of the string.
    const firstBodyLine = text.split("\n")[2];
    expect(firstBodyLine).toContain("555-0199");

    // In the HTML body (after the heading block layout.ts renders), the
    // phone line must be the very first paragraph of body content.
    const bodyStart = html.indexOf("555-0199");
    const overdueMention = html.indexOf("No response in");
    expect(bodyStart).toBeGreaterThan(-1);
    expect(bodyStart).toBeLessThan(overdueMention);
  });

  it("includes the liability line about calling being the reliable check", () => {
    const { text } = buildDispatchSlaAlertEmail({
      vendorName: "Metro Refrigeration",
      vendorPhone: "555-0199",
      equipmentName: "Ice machine",
      locationName: "Downtown",
      minutesOverdue: 45,
      priorityLabel: "Normal",
      requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
    });
    expect(text).toContain("EquipQR can't confirm a vendor received an email");
  });
});
