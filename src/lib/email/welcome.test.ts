import { describe, expect, it } from "vitest";

// welcome.ts (via layout.ts) is `import "server-only"`-tagged; vitest runs
// it under Node, not React's "react-server" condition, so the real package
// would throw. Same fix as api-auth.test.ts.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { buildWelcomeEmail } from "./welcome";

describe("buildWelcomeEmail", () => {
  it("service_provider: gets the 'gear you service' / truck-roll steps and the full-access trial line", () => {
    const { html, text } = buildWelcomeEmail({
      companyName: "Riverside Repair",
      kind: "service_provider",
      recipientName: "Jamie",
      dashboardUrl: "https://app.equipqr.com/dashboard",
    });

    expect(html).toContain("gear you service");
    expect(html).toContain("truck roll");
    expect(html).toContain("14-day free trial with full access");
    expect(text).toContain("14-day free trial with full access");
    // Never the owner-kind wizard steps.
    expect(html).not.toContain("restaurant equipment types");
  });

  it("equipment_owner: gets the location/equipment/poster/vendor steps and the Kitchen-trial line, never the provider steps or 'full access' claim (C1-05)", () => {
    const { html, text } = buildWelcomeEmail({
      companyName: "Rosie's Diner",
      kind: "equipment_owner",
      recipientName: "Rosie",
      dashboardUrl: "https://app.equipqr.com/dashboard",
    });

    expect(html).toContain("Add your location");
    expect(html).toContain("restaurant equipment types");
    expect(html).toContain("QR poster");
    expect(html).toContain("Add a vendor");
    expect(html).toContain("Kitchen features");
    expect(html).toContain("Free plan (1 location, 10 units)");
    expect(html).toContain("never locks");
    expect(text).toContain("Kitchen features");
    // Never the provider-only wording.
    expect(html).not.toContain("gear you service");
    expect(html).not.toContain("truck roll");
    expect(html).not.toContain("full access");
  });

  it("greets by name when given, and generically when not", () => {
    const named = buildWelcomeEmail({
      companyName: "Riverside Repair",
      kind: "service_provider",
      recipientName: "Jamie",
      dashboardUrl: "https://x",
    });
    expect(named.html).toContain("Hi Jamie,");

    const anon = buildWelcomeEmail({
      companyName: "Riverside Repair",
      kind: "service_provider",
      recipientName: null,
      dashboardUrl: "https://x",
    });
    expect(anon.html).toContain("Hi there,");
  });
});
