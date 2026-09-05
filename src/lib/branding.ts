import { getPlan, type PlanId } from "@/lib/plans";
import type { CompanyPublicProfile } from "@/lib/types";

// Resolved, plan-gated branding for customer-facing surfaces (scan page,
// /r/<token> status page, customer emails). Companies on plans without the
// `branding` feature still get their name + contact buttons — just not their
// logo or colour. Everything here is safe to pass to client components.

export const DEFAULT_BRAND_COLOR = "#0d9488"; // teal-600, matches the app primary + email header

export type ResolvedBranding = {
  companyName: string;
  /** Absolute URL to the logo, or null when unset / not entitled. */
  logoUrl: string | null;
  /** Hex colour to use for primary buttons/header. Always set (falls back to the EquipQR teal). */
  brandColor: string;
  /** Readable text colour for use on top of brandColor. */
  onBrandColor: "#ffffff" | "#0f172a";
  phone: string | null;
  smsNumber: string | null;
  website: string | null;
  /** True when the company's plan includes custom branding and something custom is actually set. */
  isCustom: boolean;
};

/** Public URL for an object in the public `company-assets` bucket. */
export function companyAssetUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/company-assets/${path}`;
}

/** Whether a hex colour is light enough to need dark text on top of it (WCAG-ish relative luminance). */
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5;
}

export function resolveBranding(params: {
  company: CompanyPublicProfile;
  planId: PlanId | null | undefined;
  supabaseUrl: string;
}): ResolvedBranding {
  const { company, supabaseUrl } = params;
  // Fail open to "entitled" when the plan can't be determined — a billing
  // hiccup shouldn't strip a paying customer's logo off their public pages.
  const entitled = params.planId ? getPlan(params.planId).features.branding : true;

  const logoUrl = entitled ? companyAssetUrl(supabaseUrl, company.logo_path) : null;
  const brandColor =
    entitled && company.brand_color && /^#[0-9a-f]{6}$/i.test(company.brand_color)
      ? company.brand_color
      : DEFAULT_BRAND_COLOR;

  return {
    companyName: company.name,
    logoUrl,
    brandColor,
    onBrandColor: isLightColor(brandColor) ? "#0f172a" : "#ffffff",
    phone: company.phone ?? null,
    smsNumber: company.sms_number ?? null,
    website: company.website ?? null,
    isCustom: entitled && (!!logoUrl || brandColor !== DEFAULT_BRAND_COLOR),
  };
}

/** Normalises a phone number into a `tel:` / `sms:` href (digits and leading +). */
export function phoneHref(scheme: "tel" | "sms", value: string): string {
  const cleaned = value.replace(/[^\d+]/g, "");
  return `${scheme}:${cleaned}`;
}
