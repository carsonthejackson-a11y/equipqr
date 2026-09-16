import { describe, expect, it } from "vitest";

// trial-ending.ts (via layout.ts) is `import "server-only"`-tagged; vitest
// runs it under Node, not React's "react-server" condition, so the real
// package would throw. Same fix as api-auth.test.ts.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { buildTrialEndingEmail } from "./trial-ending";

describe("buildTrialEndingEmail", () => {
  describe("service_provider", () => {
    it("describes the real lock (dashboard pauses; QR pages and intake keep working) — never the old, false claim", () => {
      const { html, text } = buildTrialEndingEmail({
        companyName: "Riverside Repair",
        kind: "service_provider",
        daysLeft: 3,
        billingUrl: "https://app.equipqr.com/dashboard/settings/billing",
      });

      expect(html).toContain("your dashboard will pause");
      expect(html).toContain("stickers, customer scan pages and incoming requests keep working");
      // The old, inaccurate claim this replaced.
      expect(html).not.toContain("customer-facing QR pages working without interruption");
      expect(text).toContain("dashboard will pause");
    });

    it("says 'ends today' at zero days left, and pluralizes correctly above 1", () => {
      const today = buildTrialEndingEmail({
        companyName: "Riverside Repair",
        kind: "service_provider",
        daysLeft: 0,
        billingUrl: "https://x",
      });
      expect(today.subject).toBe("Riverside Repair's EquipQR trial ends today");

      const oneDay = buildTrialEndingEmail({
        companyName: "Riverside Repair",
        kind: "service_provider",
        daysLeft: 1,
        billingUrl: "https://x",
      });
      expect(oneDay.subject).toContain("in 1 day");
      expect(oneDay.subject).not.toContain("1 days");

      const threeDays = buildTrialEndingEmail({
        companyName: "Riverside Repair",
        kind: "service_provider",
        daysLeft: 3,
        billingUrl: "https://x",
      });
      expect(threeDays.subject).toContain("in 3 days");
    });
  });

  describe("equipment_owner", () => {
    it("says the account never locks and describes the Free fallback, not a lockout threat (C1-34)", () => {
      const { subject, html, text } = buildTrialEndingEmail({
        companyName: "Rosie's Diner",
        kind: "equipment_owner",
        daysLeft: 3,
        billingUrl: "https://app.equipqr.com/dashboard/settings/billing",
      });

      expect(subject).toContain("Kitchen trial");
      expect(html).toContain("Kitchen trial is ending soon");
      expect(html).toContain("Free plan");
      expect(html).toContain("1 location, 10 units");
      expect(html).toContain("never lock");
      // Never a claim that anything the owner has stops working.
      expect(html).not.toContain("your dashboard will pause");
      expect(text).toContain("never lock");
    });

    it("says 'Kitchen trial ends today' at zero days left", () => {
      const { subject, html } = buildTrialEndingEmail({
        companyName: "Rosie's Diner",
        kind: "equipment_owner",
        daysLeft: 0,
        billingUrl: "https://x",
      });
      expect(subject).toBe("Rosie's Diner's EquipQR Kitchen trial ends today");
      expect(html).toContain("Kitchen trial ends today");
    });
  });
});
