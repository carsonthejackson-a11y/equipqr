import * as Sentry from "@sentry/nextjs";

// Runs for the proxy (src/proxy.ts) if it's ever switched to the edge
// runtime, and for any route segment configured with `runtime = "edge"`.
// SENTRY_DSN is optional — with it unset, this is a no-op.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
