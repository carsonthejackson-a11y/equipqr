// Shared marketing/SEO constants. Kept small and dependency-free so any
// workstream can import it without pulling in server-only code.

export const SITE_NAME = "EquipQR";

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://equipqr.co").replace(
  /\/+$/,
  ""
);

export const SITE_DESCRIPTION =
  "Put a QR sticker on every unit you service. Customers scan it to troubleshoot and request service — no app, no login. Fewer truck rolls, faster dispatch.";

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@equipqr.co";
