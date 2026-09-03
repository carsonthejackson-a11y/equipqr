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
   * Pre-printed QR sticker batches: platform admins generate a pool of codes,
   * ship stickers, and companies claim a code when tagging equipment.
   * Parked for launch — set NEXT_PUBLIC_FEATURE_BATCH_QR=true to re-enable
   * the "use a pre-printed code" option, the unclaimed-code claim page, the
   * admin batch tools, and the marketing copy.
   */
  batchQr: flag(process.env.NEXT_PUBLIC_FEATURE_BATCH_QR, false),
} as const;
