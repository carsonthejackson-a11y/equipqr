import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// send.ts is `import "server-only"`-tagged; vitest runs it under Node, not
// React's "react-server" condition, so the real package would throw. Same
// fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

import { extractFromAddress, sendEmail } from "./send";

describe("extractFromAddress", () => {
  it("returns a bare address unchanged", () => {
    expect(extractFromAddress("notify@equipqr.co")).toBe("notify@equipqr.co");
  });

  it('extracts the address out of a "Display Name <addr>" value', () => {
    expect(extractFromAddress("EquipQR <notify@equipqr.co>")).toBe("notify@equipqr.co");
  });

  it("trims surrounding whitespace either way", () => {
    expect(extractFromAddress("  notify@equipqr.co  ")).toBe("notify@equipqr.co");
    expect(extractFromAddress("EquipQR < notify@equipqr.co >")).toBe("notify@equipqr.co");
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    // Every existing test/CI environment leaves these unset — stub them
    // explicitly so this test never depends on that (and never risks a real
    // network call if they ever were set).
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-ops and returns false when RESEND_API_KEY/RESEND_FROM_EMAIL aren't configured", async () => {
    const sent = await sendEmail({ to: "a@example.com", subject: "Subject", html: "<p>hi</p>", text: "hi" });
    expect(sent).toBe(false);
  });

  it("stays false the same way when fromName is passed — the new param never bypasses the configured-check (backward compatible)", async () => {
    const sent = await sendEmail({
      to: "a@example.com",
      subject: "Subject",
      html: "<p>hi</p>",
      text: "hi",
      fromName: "Acme via EquipQR",
    });
    expect(sent).toBe(false);
  });
});
