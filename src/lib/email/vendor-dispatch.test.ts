import { describe, expect, it, vi } from "vitest";

// vendor-dispatch.ts imports layout.ts, which is `import "server-only"`-
// tagged; vitest runs it under Node, not React's "react-server" condition,
// so the real package would throw. Same fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

import { buildVendorDispatchEmail, type VendorDispatchEmailInput } from "./vendor-dispatch";

const BASE: VendorDispatchEmailInput = {
  ownerName: "Riverside Diner",
  equipmentName: "Walk-in cooler",
  make: "Traulsen",
  model: "G20010",
  serialNumber: "SN-1",
  inWarranty: false,
  locationName: "Main St",
  locationAddress: "123 Main St",
  locationHours: "6am-10pm",
  symptoms: ["Not cooling"],
  description: "It's been warm all morning",
  reporterName: "Jamie Cook",
  reporterPhone: "555-0100",
  accountNumber: null,
  photoCount: 0,
  workOrderUrl: "https://app.equipqr.com/v/abcd1234",
};

describe("buildVendorDispatchEmail", () => {
  it("subject contains the owner and equipment names, stays under 160 chars, and has no CR/LF", () => {
    const { subject } = buildVendorDispatchEmail(BASE);
    expect(subject).toContain("Riverside Diner");
    expect(subject).toContain("Walk-in cooler");
    expect(subject.length).toBeLessThanOrEqual(160);
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("strips embedded CR/LF from the equipment name out of the subject", () => {
    const { subject } = buildVendorDispatchEmail({
      ...BASE,
      equipmentName: "Walk-in\r\ncooler",
    });
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("escapes a <script> tag in the description in the HTML body", () => {
    const { html } = buildVendorDispatchEmail({
      ...BASE,
      description: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the /v/<token> work order URL in the text part", () => {
    const { text } = buildVendorDispatchEmail(BASE);
    expect(text).toContain("/v/abcd1234");
  });

  it("includes warranty, account number and photo count when present", () => {
    const { html, text } = buildVendorDispatchEmail({
      ...BASE,
      inWarranty: true,
      accountNumber: "ACCT-9",
      photoCount: 2,
    });
    expect(html).toContain("In warranty");
    expect(html).toContain("ACCT-9");
    expect(html).toContain("2 photos");
    expect(text).toContain("In warranty");
    expect(text).toContain("ACCT-9");
  });

  it("names the reporter and their phone, and carries the no-account footer note", () => {
    const { html } = buildVendorDispatchEmail(BASE);
    expect(html).toContain("Jamie Cook");
    expect(html).toContain("555-0100");
    expect(html).toContain("don't need an account");
  });
});
