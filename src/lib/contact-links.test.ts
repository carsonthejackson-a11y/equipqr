import { describe, expect, it } from "vitest";
import { mapsHref, smsHref, telHref } from "@/lib/contact-links";

describe("telHref", () => {
  it("normalizes to digits and a leading + only, matching branding.ts's phoneHref", () => {
    expect(telHref("(214) 555-0100")).toBe("tel:2145550100");
    expect(telHref("+1 214-555-0100")).toBe("tel:+12145550100");
  });
});

describe("smsHref", () => {
  it("produces a bare sms: link when no body is given", () => {
    expect(smsHref("(214) 555-0100")).toBe("sms:2145550100");
  });

  it("appends ?&body=<encoded> so the body pre-fills on both iOS and Android", () => {
    expect(smsHref("(214) 555-0100", "On my way!")).toBe("sms:2145550100?&body=On%20my%20way!");
  });

  it("encodes special characters in the body", () => {
    const body = "50% off & free?";
    expect(smsHref("2145550100", body)).toBe(`sms:2145550100?&body=${encodeURIComponent(body)}`);
  });

  it("treats an empty-string body the same as no body", () => {
    expect(smsHref("2145550100", "")).toBe("sms:2145550100");
  });
});

describe("mapsHref", () => {
  it("builds a Google Maps search URL from a free-text address", () => {
    expect(mapsHref("123 Main St, Dallas, TX")).toBe("https://maps.google.com/?q=123%20Main%20St%2C%20Dallas%2C%20TX");
  });

  it("encodes special characters", () => {
    const address = "Unit #4 & 5, Main St";
    expect(mapsHref(address)).toBe(`https://maps.google.com/?q=${encodeURIComponent(address)}`);
  });
});
