import { describe, expect, it, vi } from "vitest";

// assignment.ts (via layout.ts) is `import "server-only"`-tagged; vitest
// runs it under Node, not React's "react-server" condition, so the real
// package would throw. Same fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

import { buildAssigneeNotificationEmail } from "./assignment";

const BASE = {
  technicianName: "Alex Tech",
  equipmentName: "Ice machine",
  siteName: "Downtown Diner",
  address: "123 Main St, Springfield",
  whenText: "Wednesday, September 16 at 10:00 AM CDT",
  staffScanUrl: "https://app.equipqr.com/e/abcd1234",
  requestUrl: "https://app.equipqr.com/dashboard/requests/r1",
};

describe("buildAssigneeNotificationEmail", () => {
  it("gives each reason a distinct heading/subject", () => {
    const assigned = buildAssigneeNotificationEmail({ ...BASE, reason: "assigned" });
    const scheduled = buildAssigneeNotificationEmail({ ...BASE, reason: "scheduled" });
    const reminder = buildAssigneeNotificationEmail({ ...BASE, reason: "reminder" });

    expect(assigned.html).toContain("You've been assigned a job");
    expect(scheduled.html).toContain("Visit scheduled");
    expect(reminder.html).toContain("Upcoming visit reminder");
    expect(new Set([assigned.subject, scheduled.subject, reminder.subject]).size).toBe(3);
  });

  it("prefers the staff scan link as the CTA, with a secondary link to the full dashboard request", () => {
    const { html, text } = buildAssigneeNotificationEmail({ ...BASE, reason: "scheduled" });
    expect(html).toContain(BASE.staffScanUrl);
    expect(html).toContain("View the full request in the dashboard");
    expect(text).toContain(BASE.staffScanUrl);
  });

  it("falls back to the dashboard request link as the CTA when the unit has no QR code on file", () => {
    const { html } = buildAssigneeNotificationEmail({ ...BASE, reason: "scheduled", staffScanUrl: null });
    expect(html).toContain("Open in EquipQR");
    expect(html).toContain(BASE.requestUrl);
    // No secondary link when the dashboard link IS the primary CTA already.
    expect(html).not.toContain("View the full request in the dashboard");
  });

  it("renders the address as a clickable Google Maps link", () => {
    const { html } = buildAssigneeNotificationEmail({ ...BASE, reason: "reminder" });
    expect(html).toContain("maps.google.com");
    expect(html).toContain("123 Main St, Springfield");
  });

  it("omits the maps line entirely when there's no address on file", () => {
    const { html } = buildAssigneeNotificationEmail({ ...BASE, reason: "reminder", address: null });
    expect(html).not.toContain("maps.google.com");
  });

  it("includes the pre-formatted whenText verbatim (never re-derives or re-formats a time itself)", () => {
    const { html, text } = buildAssigneeNotificationEmail({ ...BASE, reason: "scheduled" });
    expect(html).toContain("Wednesday, September 16 at 10:00 AM CDT");
    expect(text).toContain("Wednesday, September 16 at 10:00 AM CDT");
  });

  it("omits the 'Scheduled:' line when reason is 'assigned' and nothing is scheduled yet", () => {
    const { html, text } = buildAssigneeNotificationEmail({ ...BASE, reason: "assigned", whenText: null });
    expect(html).not.toContain("Scheduled:");
    expect(text).not.toContain("Scheduled:");
  });

  it("greets by name when given, and generically when not", () => {
    const named = buildAssigneeNotificationEmail({ ...BASE, reason: "assigned" });
    expect(named.html).toContain("Hi Alex Tech,");

    const anon = buildAssigneeNotificationEmail({ ...BASE, reason: "assigned", technicianName: null });
    expect(anon.html).toContain("Hi,");
  });

  it("mentions the site name in the lead sentence when given", () => {
    const { html } = buildAssigneeNotificationEmail({ ...BASE, reason: "assigned" });
    expect(html).toContain("Downtown Diner");
  });

  it("escapes HTML in technician/equipment/site names", () => {
    const { html } = buildAssigneeNotificationEmail({
      ...BASE,
      reason: "assigned",
      technicianName: "<script>alert(1)</script>",
      equipmentName: "<b>Fryer</b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Fryer</b>");
  });
});
