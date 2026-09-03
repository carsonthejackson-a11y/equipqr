import "server-only";
import Stripe from "stripe";

// Lazy Stripe client, mirroring the getClient() pattern in src/lib/anthropic.ts.
// STRIPE_SECRET_KEY is intentionally allowed to be unset in dev (.env.local
// doesn't have real Stripe keys here) — callers should check
// isStripeConfigured() first and degrade gracefully rather than letting this
// throw during a page render.

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured — check isStripeConfigured() before calling getStripe()"
    );
  }
  if (!client) {
    client = new Stripe(secretKey);
  }
  return client;
}
