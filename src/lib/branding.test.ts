import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_COLOR,
  MIN_AA_CONTRAST,
  companyAssetUrl,
  contrastRatio,
  isLightColor,
  phoneHref,
  resolveBranding,
} from "./branding";

const company = {
  name: "Acme Espresso",
  phone: "(214) 555-0100",
  sms_number: null,
  website: null,
  logo_path: "abc/logo.png",
  brand_color: "#ff6600",
};

describe("resolveBranding", () => {
  it("applies custom logo + colour on plans with branding", () => {
    const b = resolveBranding({ company, planId: "pro", supabaseUrl: "https://x.supabase.co/" });
    expect(b.logoUrl).toBe("https://x.supabase.co/storage/v1/object/public/company-assets/abc/logo.png");
    expect(b.brandColor).toBe("#ff6600");
    expect(b.isCustom).toBe(true);
  });

  it("strips logo + colour but keeps contact info on Starter", () => {
    const b = resolveBranding({ company, planId: "starter", supabaseUrl: "https://x.supabase.co" });
    expect(b.logoUrl).toBeNull();
    expect(b.brandColor).toBe(DEFAULT_BRAND_COLOR);
    expect(b.phone).toBe("(214) 555-0100");
    expect(b.isCustom).toBe(false);
  });

  it("fails open when the plan is unknown", () => {
    const b = resolveBranding({ company, planId: null, supabaseUrl: "https://x.supabase.co" });
    expect(b.brandColor).toBe("#ff6600");
  });

  it("rejects malformed colours", () => {
    const b = resolveBranding({
      company: { ...company, brand_color: "red" },
      planId: "pro",
      supabaseUrl: "https://x.supabase.co",
    });
    expect(b.brandColor).toBe(DEFAULT_BRAND_COLOR);
  });
});

describe("helpers", () => {
  it("picks dark text on light backgrounds", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#0d9488")).toBe(false);
  });
  it("builds tel/sms hrefs", () => {
    expect(phoneHref("tel", "(214) 555-0100")).toBe("tel:2145550100");
    expect(phoneHref("sms", "+1 214 555 0100")).toBe("sms:+12145550100");
  });
  it("returns null asset url for no path", () => {
    expect(companyAssetUrl("https://x.supabase.co", null)).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, 1 for identical colours", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#0f766e", "#0f766e")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0f766e", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#0f766e")!, 5);
  });

  it("returns null for a malformed colour", () => {
    expect(contrastRatio("teal", "#ffffff")).toBeNull();
    expect(contrastRatio("#0f766e", "not-a-color")).toBeNull();
  });

  it("DEFAULT_BRAND_COLOR meets AA against white text", () => {
    expect(contrastRatio(DEFAULT_BRAND_COLOR, "#ffffff")!).toBeGreaterThanOrEqual(MIN_AA_CONTRAST);
  });

  it("flags the old default (teal-600) as failing AA against white text", () => {
    // Regression guard: #0d9488 is the color DEFAULT_BRAND_COLOR replaced
    // because it fell short of AA (Q-26) — this must stay under the floor.
    expect(contrastRatio("#0d9488", "#ffffff")!).toBeLessThan(MIN_AA_CONTRAST);
  });
});
