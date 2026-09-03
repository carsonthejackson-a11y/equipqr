import * as Sentry from "@sentry/nextjs";

// next.config.ts copies SENTRY_DSN into NEXT_PUBLIC_SENTRY_DSN for the
// browser bundle (a Sentry DSN is meant to be public — it's not a secret).
// Unset, this is a no-op: the app runs exactly as it would without Sentry.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Conservative sampling — this is a low-traffic internal SaaS, not a
    // high-volume consumer app; keep ingest volume (and cost) small. No
    // Session Replay: it's off by default and we don't turn it on.
    tracesSampleRate: 0.1,
  });
}

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
) {
  if (!dsn) return;
  Sentry.addBreadcrumb({
    category: "navigation",
    message: `${navigationType} → ${url}`,
    level: "info",
  });
}
