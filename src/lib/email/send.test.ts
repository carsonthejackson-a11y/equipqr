import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// send.ts is `import "server-only"`-tagged; vitest runs it under Node, not
// React's "react-server" condition, so the real package would throw. Same
// fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

import { extractFromAddress, formatFromHeader, sendEmail } from "./send";

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

describe("formatFromHeader", () => {
  const address = "notify@equipqr.co";

  it("quotes a plain ASCII display name", () => {
    expect(formatFromHeader("Bluebonnet Espresso via EquipQR", address)).toBe(
      '"Bluebonnet Espresso via EquipQR" <notify@equipqr.co>'
    );
  });

  it("keeps commas, @ and parentheses inside the quotes", () => {
    expect(formatFromHeader("Smith & Sons, LLC (Dallas) @ Deep Ellum via EquipQR", address)).toBe(
      '"Smith & Sons, LLC (Dallas) @ Deep Ellum via EquipQR" <notify@equipqr.co>'
    );
  });

  it("escapes backslashes and double quotes", () => {
    expect(formatFromHeader('Joe\\s "Best" Repair', address)).toBe('"Joe\\\\s \\"Best\\" Repair" <notify@equipqr.co>');
  });

  it("encodes non-ASCII names as RFC 2047 encoded-words that round-trip", () => {
    const header = formatFromHeader("Café Bella via EquipQR", address);
    expect(header.endsWith(" <notify@equipqr.co>")).toBe(true);
    const words = header.replace(" <notify@equipqr.co>", "").split(" ");
    for (const word of words) {
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(word.length).toBeLessThanOrEqual(75);
    }
    const decoded = words
      .map((word) => Buffer.from(word.slice("=?UTF-8?B?".length, -2), "base64").toString("utf8"))
      .join("");
    expect(decoded).toBe("Café Bella via EquipQR");
  });

  it("splits long non-ASCII names without cutting a character", () => {
    const name = "Ñandú Café & Crêperie — Espresso Service Ñ via EquipQR";
    const header = formatFromHeader(name, address);
    const words = header.replace(" <notify@equipqr.co>", "").split(" ");
    expect(words.length).toBeGreaterThan(1);
    const decoded = words
      .map((word) => Buffer.from(word.slice("=?UTF-8?B?".length, -2), "base64").toString("utf8"))
      .join("");
    expect(decoded).toBe(name);
  });

  it("drops CR/LF so a name can never start a new header line", () => {
    const header = formatFromHeader("Acme\r\nBcc: victim@example.com", address);
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("falls back to the bare address for an empty name", () => {
    expect(formatFromHeader("   ", address)).toBe(address);
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
