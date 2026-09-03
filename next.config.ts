import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  env: {
    // A Sentry DSN is meant to be public (the client SDK ships it in the
    // bundle by design) — this exposes it to the browser under a
    // NEXT_PUBLIC_ name without needing a second, duplicate env var.
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN,
  },
};

// SENTRY_DSN is optional. Without it, skip withSentryConfig entirely so the
// build has zero Sentry-related behavior — no source map upload attempt,
// no build-time warnings about a missing auth token, nothing.
const sentryDsnConfigured = Boolean(process.env.SENTRY_DSN);

export default sentryDsnConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      // Source map upload needs an auth token (a CI/deploy secret, not
      // something every contributor has); skip it rather than fail the
      // build when one isn't configured.
      sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
      },
      webpack: {
        treeshake: { removeDebugLogging: true },
        automaticVercelMonitors: false,
      },
    })
  : nextConfig;
