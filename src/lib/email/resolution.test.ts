import { describe, expect, it } from "vitest";

// resolution.ts (via layout.ts) is `import "server-only"`-tagged; vitest
// runs it under Node, not React's "react-server" condition, so the real
// package would throw. Same fix as api-auth.test.ts.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { buildResolutionEmail } from "./resolution";
import type { RequestEmailBranding } from "./request-status";

const BRAND: RequestEmailBranding = {
  name: "Riverside Repair",
  color: "#123456",
  onColor: "#ffffff",
  logoUrl: "https://example.supabase.co/logo.png",
  phone: "555-0100",
};

describe("buildResolutionEmail", () => {
  it("is branded with the company's own name/color/logo (C1-45), not the plain EquipQR template", () => {
    const { html } = buildResolutionEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Replaced the water filter.",
      recommendations: "",
    });

    expect(html).toContain("Riverside Repair");
    expect(html).toContain("#123456");
    expect(html).toContain("https://example.supabase.co/logo.png");
  });

  it("defaults to 'service request' but takes a vocab-aware noun for owner kind", () => {
    const provider = buildResolutionEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Fixed it.",
      recommendations: "",
    });
    expect(provider.html).toContain("Your service request for");

    const owner = buildResolutionEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Fixed it.",
      recommendations: "",
      requestNoun: "work order",
    });
    expect(owner.html).toContain("Your work order for");
  });

  it("includes recommendations only when given", () => {
    const withRecs = buildResolutionEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Fixed it.",
      recommendations: "Replace the filter every 6 months.",
    });
    expect(withRecs.html).toContain("Recommendations");
    expect(withRecs.text).toContain("Replace the filter every 6 months.");

    const withoutRecs = buildResolutionEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Fixed it.",
      recommendations: "",
    });
    expect(withoutRecs.html).not.toContain("Recommendations");
  });

  it("includes a 'Questions? Call' line with the company phone, matching the other customer templates", () => {
    const { html, text } = buildResolutionEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Fixed it.",
      recommendations: "",
    });
    expect(html).toContain("Questions? Call 555-0100");
    expect(text).toContain("Questions? Call 555-0100");
  });

  it("omits the phone line when the company has none on file", () => {
    const { html } = buildResolutionEmail({
      brand: { ...BRAND, phone: null },
      equipmentName: "Ice machine",
      contactName: "Jamie",
      summary: "Fixed it.",
      recommendations: "",
    });
    expect(html).not.toContain("Questions? Call");
  });
});
