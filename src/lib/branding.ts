import { getPlan, type PlanId } from "@/lib/plans";
import type { CompanyPublicProfile } from "@/lib/types";

// Resolved, plan-gated branding for customer-facing surfaces (scan page,
// /r/<token> status page, customer emails). Companies on plans without the
// `branding` feature still get their name + contact buttons — just not their
// logo or colour. Everything here is safe to pass to client components.

// teal-700: the lightest teal that keeps white text on top at WCAG AA (4.5:1)
// for normal-size text — see contrastRatio() below. Matches the app --primary
// in src/app/globals.css:root (Q-26).
export const DEFAULT_BRAND_COLOR = "#0f766e";

/** WCAG AA contrast floor for normal-size text (4.5:1). */
export const MIN_AA_CONTRAST = 4.5;

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

/** WCAG relative luminance (0–1) of a `#rrggbb` colour, or null when it isn't one. */
function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether a hex colour is light enough to need dark text on top of it (WCAG-ish relative luminance). */
export function isLightColor(hex: string): boolean {
  const luminance = relativeLuminance(hex);
  return luminance !== null && luminance > 0.5;
}

/**
 * WCAG 2 contrast ratio between two `#rrggbb` colours (1–21, higher is more
 * contrast). Returns null when either colour is malformed. Used by the
 * Branding settings warning (Q-26) — order of the two colours doesn't matter.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  if (lA === null || lB === null) return null;
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
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
