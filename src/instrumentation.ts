import type { Instrumentation } from "next";

// Loads the right Sentry init for whichever server runtime this instance is
// running under. Both configs are themselves no-ops when SENTRY_DSN isn't
// set, so this never fails a build or a boot with no DSN configured.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
};
