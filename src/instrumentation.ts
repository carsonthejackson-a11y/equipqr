import type { Instrumentation } from "next";
import { checkProductionEnv } from "@/lib/env";

// Loads the right Sentry init for whichever server runtime this instance is
// running under. Both configs are themselves no-ops when SENTRY_DSN isn't
// set, so this never fails a build or a boot with no DSN configured.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    // C1-53/C1-54: report-only production config guard — see
    // checkProductionEnv's own doc comment for what it checks and why it
    // doesn't throw by default. Runs once per server instance, after
    // Sentry's own init just above so a captureMessage (when SENTRY_DSN is
    // set) has somewhere to actually go. nodejs-only, matching the guard's
    // own node:crypto-free but still server-only nature — no need to also
    // run it from the edge branch below.
    await checkProductionEnv();
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
