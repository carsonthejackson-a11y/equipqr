import { describe, expect, it, vi } from "vitest";

// service-request-notification.ts (via layout.ts) is `import "server-only"`-
// tagged; vitest runs it under Node, not React's "react-server" condition,
// so the real package would throw. Same fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

import { buildServiceRequestNotificationEmail } from "./service-request-notification";
import { vocabFor } from "@/lib/vocab";

const BASE = {
  equipmentName: "Ice machine",
  contactName: "Jamie",
  contactEmail: "jamie@example.com",
  contactPhone: "555-0100",
  description: "Not making ice",
  mediaCount: 0,
  aiSummary: null,
  troubleshootingPath: [],
  dashboardUrl: "https://app.equipqr.com/dashboard/requests/r1",
};

describe("buildServiceRequestNotificationEmail", () => {
  it("defaults to provider wording ('New service request') when no vocab is given", () => {
    const { subject, html } = buildServiceRequestNotificationEmail(BASE);
    expect(subject).toBe("New service request: Ice machine");
    expect(html).toContain("New service request");
    expect(html).toContain("A new service request was submitted for");
  });

  it("uses owner wording ('New work order') for an equipment_owner company (C1-05) — this is the pm-due cron's actual bug", () => {
    const { subject, html, text } = buildServiceRequestNotificationEmail({
      ...BASE,
      vocab: vocabFor("equipment_owner"),
    });
    expect(subject).toBe("New work order: Ice machine");
    expect(html).toContain("New work order");
    expect(html).toContain("A new work order was submitted for");
    expect(text).toContain("A new work order was submitted for");
  });

  it("includes the urgency label only when given", () => {
    const withPriority = buildServiceRequestNotificationEmail({ ...BASE, priority: "High" });
    expect(withPriority.html).toContain("Urgency:</strong> High");

    const withoutPriority = buildServiceRequestNotificationEmail(BASE);
    expect(withoutPriority.html).not.toContain("Urgency:");
  });

  it("includes the AI summary block only when given", () => {
    const withSummary = buildServiceRequestNotificationEmail({ ...BASE, aiSummary: "Tried the reset button." });
    expect(withSummary.html).toContain("AI summary");
    expect(withSummary.html).toContain("Tried the reset button.");

    const withoutSummary = buildServiceRequestNotificationEmail(BASE);
    expect(withoutSummary.html).not.toContain("AI summary");
  });
});
