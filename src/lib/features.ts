// Product-wide feature flags. These gate whole features on/off regardless of
// plan (plan-level entitlements live in src/lib/plans.ts). Flip an env var to
// bring a feature back — no code changes needed.
//
// NEXT_PUBLIC_ so the same value is visible to server and client components.

function flag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

export const FEATURES = {
  /**
   * Pre-printed QR sticker batches: platform admins generate a pool of codes
   * for a company (src/app/admin/qr-codes) and, since the Next roadmap,
   * owners can also mint their own blank-code pool for scan-to-onboard
   * (src/app/dashboard/settings/qr-codes, `generate_company_qr_batch` RPC).
   * Either way a company claims a code when tagging equipment — see
   * docs/BATCH-QR.md. Un-parked by default; set
   * NEXT_PUBLIC_FEATURE_BATCH_QR=false to turn the whole feature back off
   * (the "use a pre-printed code" option, the unclaimed-code claim/onboard
   * flow, the owner blank-code pool, the admin batch tools, and the
   * marketing copy).
   */
  batchQr: flag(process.env.NEXT_PUBLIC_FEATURE_BATCH_QR, true),
} as const;
