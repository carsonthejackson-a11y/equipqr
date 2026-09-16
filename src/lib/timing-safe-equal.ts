import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for a bearer token against a server
 * secret (CRON_SECRET today) — a plain `===`/`!==` short-circuits on the
 * first mismatched byte, leaking a few nanoseconds per correctly-guessed
 * prefix character. That's a narrow side channel, but a real one for a
 * secret an attacker gets to guess at repeatedly over the network
 * (C1-53/C1-54).
 *
 * Node-runtime only (`node:crypto`) — only import this from a route that
 * declares (or defaults to) `export const runtime = "nodejs"`. Never import
 * it from anything reachable from src/proxy.ts or another edge-runtime
 * entry point; src/lib/env.ts deliberately does NOT import this for exactly
 * that reason (it's pulled into the edge bundle via
 * src/lib/supabase/middleware.ts).
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Different lengths can never match, and timingSafeEqual throws (rather
  // than returning false) when its two buffers aren't the same length — so
  // this check is required, not just an optimization.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
