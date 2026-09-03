import * as Sentry from "@sentry/nextjs";

// SENTRY_DSN is optional — with it unset, this is a no-op and the app runs
// exactly as it would without Sentry installed at all.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Conservative sampling — this is a low-traffic internal SaaS, not a
    // high-volume consumer app; keep ingest volume (and cost) small.
    tracesSampleRate: 0.1,
  });
}
