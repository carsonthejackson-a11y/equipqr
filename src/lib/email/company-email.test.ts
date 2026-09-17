import { beforeEach, describe, expect, it, vi } from "vitest";

// company-email.ts (and send.ts, which it wraps) are `import "server-only"`-
// tagged; vitest runs it under Node, not React's "react-server" condition,
// so the real package would throw. Same fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

const sendEmailMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/email/send", () => ({
  sendEmail: (params: unknown) => sendEmailMock(params),
}));

import { buildFromHeader, buildReplyTo, sendCompanyEmail } from "./company-email";

describe("buildFromHeader", () => {
  it('appends " via EquipQR" to a clean company name', () => {
    expect(buildFromHeader("Riverside Repair")).toBe("Riverside Repair via EquipQR");
  });

  it("strips quotes, angle brackets and CR/LF", () => {
    expect(buildFromHeader('Bob\'s "Best" <Repair>\r\nCo')).toBe("Bob's Best Repair Co via EquipQR");
  });

  it("collapses internal whitespace (including tabs) to single spaces", () => {
    expect(buildFromHeader("Riverside   Repair\tCo")).toBe("Riverside Repair Co via EquipQR");
  });

  it("falls back to plain EquipQR when the name sanitizes down to nothing", () => {
    expect(buildFromHeader("   ")).toBe("EquipQR");
    expect(buildFromHeader('<>""')).toBe("EquipQR");
  });

  it("caps the result to about 60 characters, still ending in the EquipQR suffix", () => {
    const result = buildFromHeader("A".repeat(100));
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("via EquipQR")).toBe(true);
  });
});

describe("buildReplyTo", () => {
  it("prefers an explicit replyTo over the company's notification email", () => {
    expect(buildReplyTo("override@example.com", "company@example.com")).toBe("override@example.com");
  });

  it("falls back to the company's notification email when replyTo is null/undefined", () => {
    expect(buildReplyTo(undefined, "company@example.com")).toBe("company@example.com");
    expect(buildReplyTo(null, "company@example.com")).toBe("company@example.com");
  });

  it("omits the header when neither value is set", () => {
    expect(buildReplyTo(null, null)).toBeUndefined();
    expect(buildReplyTo(undefined, null)).toBeUndefined();
  });

  it("omits an invalid address instead of forwarding it unsanitized", () => {
    expect(buildReplyTo("not an email, has spaces", null)).toBeUndefined();
    expect(buildReplyTo(undefined, "bad header\nvalue")).toBeUndefined();
  });
});

describe("sendCompanyEmail", () => {
  beforeEach(() => {
    sendEmailMock.mockClear();
  });

  it("sends with a company-branded fromName and the company's own Reply-To", async () => {
    sendEmailMock.mockResolvedValueOnce(true);

    const result = await sendCompanyEmail({
      company: { name: "Riverside Repair", notification_email: "shop@riverside.example" },
      to: "customer@example.com",
      subject: "Your request has been resolved",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toEqual({ sent: true, to: "customer@example.com" });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith({
      to: "customer@example.com",
      subject: "Your request has been resolved",
      html: "<p>hi</p>",
      text: "hi",
      fromName: "Riverside Repair via EquipQR",
      replyTo: "shop@riverside.example",
    });
  });

  it("lets an explicit replyTo override the company's notification email", async () => {
    sendEmailMock.mockResolvedValueOnce(true);

    await sendCompanyEmail({
      company: { name: "Riverside Repair", notification_email: "shop@riverside.example" },
      to: "customer@example.com",
      subject: "Subject",
      html: "<p>hi</p>",
      text: "hi",
      replyTo: "tech@riverside.example",
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "tech@riverside.example" }));
  });

  it("omits replyTo entirely when the company has no notification email", async () => {
    sendEmailMock.mockResolvedValueOnce(true);

    await sendCompanyEmail({
      company: { name: "Riverside Repair", notification_email: null },
      to: "customer@example.com",
      subject: "Subject",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ replyTo: undefined }));
  });

  it("reports sent:false when the underlying send fails, without throwing", async () => {
    sendEmailMock.mockResolvedValueOnce(false);

    const result = await sendCompanyEmail({
      company: { name: "Riverside Repair", notification_email: null },
      to: "customer@example.com",
      subject: "Subject",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toEqual({ sent: false, to: "customer@example.com" });
  });

  it("never throws, even when the underlying send rejects", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("network down"));

    const result = await sendCompanyEmail({
      company: { name: "Riverside Repair", notification_email: null },
      to: "customer@example.com",
      subject: "Subject",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toEqual({ sent: false, to: "customer@example.com" });
  });
});
