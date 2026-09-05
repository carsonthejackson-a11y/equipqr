import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fixed-window rate limiting backed by the `rate_limits` table via the
// `check_rate_limit()` RPC (migration 0013). DB-backed so it works across
// Vercel's serverless instances; the RPC is atomic so concurrent requests
// can't both slip under the limit.
//
// Fails OPEN: if the RPC errors (migration not applied, DB hiccup) the
// request is allowed and the failure is logged. A rate limiter must never
// take the public request form down with it.

export type RateLimitRule = {
  /** Max hits per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  /** POST /api/service-requests — per client IP. */
  serviceRequestPerIp: { limit: 10, windowSeconds: 60 * 60 } satisfies RateLimitRule,
  /** POST /api/service-requests — per QR token, guards a single sticker being spammed. */
  serviceRequestPerToken: { limit: 20, windowSeconds: 60 * 60 } satisfies RateLimitRule,
  /** POST /api/guide-chat — per client IP (each call hits the Anthropic API). */
  guideChatPerIp: { limit: 60, windowSeconds: 10 * 60 } satisfies RateLimitRule,
  /** /api/v1/* — per API key. */
  apiKey: { limit: 600, windowSeconds: 60 } satisfies RateLimitRule,
  /** Public /r/<token> status page lookups — per client IP. */
  requestStatusPerIp: { limit: 120, windowSeconds: 10 * 60 } satisfies RateLimitRule,
} as const;

/** Anything with a header lookup: a `Headers`, or Next's ReadonlyHeaders from `headers()`. */
type HeaderLookup = { get(name: string): string | null };

/** Best-effort client IP from the proxies in front of the app. Vercel sets x-forwarded-for; falls back to "unknown". */
export function getClientIp(request: Request): string {
  return getClientIpFromHeaders(request.headers);
}

/**
 * Same as {@link getClientIp} for callers that have headers but no Request —
 * server components rate-limiting a page render read them from `headers()`.
 */
export function getClientIpFromHeaders(headers: HeaderLookup): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns true when the call is within limits. `key` should include a scope
 * prefix so different routes never share a bucket, e.g. `sr:ip:1.2.3.4`.
 */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      console.error("check_rate_limit failed (allowing request):", error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("check_rate_limit threw (allowing request):", err);
    return true;
  }
}

/**
 * Convenience for route handlers: checks every (key, rule) pair and returns a
 * ready-made 429 response when any is exceeded, or null to proceed.
 */
export async function enforceRateLimits(
  checks: { key: string; rule: RateLimitRule }[]
): Promise<NextResponse | null> {
  for (const { key, rule } of checks) {
    const ok = await checkRateLimit(key, rule);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests — please wait a bit and try again." },
        { status: 429, headers: { "Retry-After": String(rule.windowSeconds) } }
      );
    }
  }
  return null;
}
