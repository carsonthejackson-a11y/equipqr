import { z } from "zod";

// An unset env var and one set to the empty string ("KEY=" with nothing
// after it, which .env.local files commonly use to document an optional
// key without providing it) must be treated the same way: absent. Without
// this, `z.string().min(1).optional()` rejects "" as a validation failure
// instead of treating it as "not configured".
function optionalString() {
  return z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
}

// Server-side environment schema. Only import this from server-only code
// (server components, server actions, route handlers, middleware/proxy).
// Validated lazily — the first property read triggers validation — so
// importing this module never crashes a build or a route that doesn't
// actually need the missing variable.
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_URL is required" })
    .min(1, "NEXT_PUBLIC_SUPABASE_URL is required")
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" })
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).url("NEXT_PUBLIC_APP_URL must be a valid URL").default("http://localhost:3000")
  ),
  NEXT_PUBLIC_SUPPORT_EMAIL: optionalString(),

  // Optional integrations. A missing one must never crash the build or
  // block routes that don't touch that integration — callers check for
  // `undefined` (or the feature that needs it throws its own clear error,
  // e.g. src/lib/anthropic.ts).
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),
  RESEND_API_KEY: optionalString(),
  RESEND_FROM_EMAIL: optionalString(),
  ANTHROPIC_API_KEY: optionalString(),
  STRIPE_SECRET_KEY: optionalString(),
  STRIPE_WEBHOOK_SECRET: optionalString(),
  // Per-kind Customer Portal configurations (scripts/stripe-setup.mjs can
  // create both — see its "Owner customer portal" step). Unset means
  // createPortalSession() omits `configuration` and Stripe falls back to
  // the account's own default portal configuration (C1-39).
  STRIPE_PORTAL_CONFIG_PROVIDER: optionalString(),
  STRIPE_PORTAL_CONFIG_OWNER: optionalString(),
  SENTRY_DSN: optionalString(),
  // Shared secret for Vercel Cron -> src/app/api/cron/*. Unset means those
  // routes reject every request (fail closed), not that the cron is skipped.
  CRON_SECRET: optionalString(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/** Parses and caches `process.env` against {@link serverEnvSchema}. Throws a single, readable error listing every problem on the first failure. */
export function loadServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      [
        "Invalid or missing environment variables:",
        formatIssues(result.error),
        "",
        "Check .env.local against .env.local.example (see README.md for where to get each value).",
      ].join("\n")
    );
  }

  cachedServerEnv = result.data;
  return cachedServerEnv;
}

/**
 * Typed, validated server environment. Validation runs lazily on the first
 * property access (not at import time) so a route that never touches a
 * missing optional var — or a build that doesn't execute this code path —
 * is unaffected.
 *
 * Server-only: do not import from a "use client" file. `process.env` is not
 * fully populated in the browser bundle (see `publicEnv` below).
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string | symbol) {
    const env = loadServerEnv();
    return env[prop as keyof ServerEnv];
  },
  has(_target, prop: string | symbol) {
    return prop in loadServerEnv();
  },
});

// Client-safe environment. NEXT_PUBLIC_* variables are only inlined into the
// browser bundle when accessed through a static `process.env.NEXT_PUBLIC_X`
// expression — Next's webpack build replaces that exact text. Reading
// `process.env` dynamically (e.g. via a loop or `process.env[key]`, which is
// how `serverEnvSchema.safeParse(process.env)` above works) does NOT get
// inlined and resolves to `undefined` in the browser. So every NEXT_PUBLIC_*
// var used client-side must be listed here explicitly, one static
// `process.env.NEXT_PUBLIC_*` reference per line.
const publicEnvSource = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
};

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required").url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).url().default("http://localhost:3000")
  ),
  NEXT_PUBLIC_SUPPORT_EMAIL: optionalString(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | undefined;

/** Typed, validated public environment — safe to import from client components. */
export function loadPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const result = publicEnvSchema.safeParse(publicEnvSource);
  if (!result.success) {
    throw new Error(
      ["Invalid or missing public environment variables:", formatIssues(result.error)].join("\n")
    );
  }

  cachedPublicEnv = result.data;
  return cachedPublicEnv;
}

export const publicEnv: PublicEnv = new Proxy({} as PublicEnv, {
  get(_target, prop: string | symbol) {
    const env = loadPublicEnv();
    return env[prop as keyof PublicEnv];
  },
  has(_target, prop: string | symbol) {
    return prop in loadPublicEnv();
  },
});

// ---------------------------------------------------------------------------
// Production env guard (C1-53/C1-54). Deliberately reads raw process.env,
// not serverEnv/loadServerEnv above — those throw on the two REQUIRED
// Supabase vars, and this guard must stay report-only by default no matter
// what the rest of the schema is doing. Keeping it decoupled means a
// broken serverEnv can never turn "report" into an accidental "throw" here.
// ---------------------------------------------------------------------------

/**
 * The vars a production deploy needs and might plausibly still be missing
 * right after launch: NEXT_PUBLIC_APP_URL (present and not still pointing
 * at localhost), the Supabase service-role key, both Resend settings, and
 * CRON_SECRET. Exported so checkProductionEnv() and /api/health?deep=1
 * report from the exact same list — the two silently drifting apart would
 * be worse than either alone.
 */
export function missingProductionEnvVars(): string[] {
  const missing: string[] = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.includes("localhost")) missing.push("NEXT_PUBLIC_APP_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!process.env.RESEND_FROM_EMAIL) missing.push("RESEND_FROM_EMAIL");
  if (!process.env.CRON_SECRET) missing.push("CRON_SECRET");
  return missing;
}

/**
 * Report-only production config guard, called once at server startup from
 * instrumentation.ts's register(). Missing config in production is loud —
 * one structured console.error naming every missing variable, plus a
 * Sentry captureMessage when SENTRY_DSN is set — but never fatal by
 * default. Some of what a fresh production deploy is missing (e.g. the
 * four owner Stripe price vars — see the webhook route's kind-mismatch
 * guard, which already treats an unmapped price as "fine, just log it")
 * is genuinely okay to launch without for a while, and a hard crash here
 * would be worse than the misconfiguration itself.
 *
 * It deliberately never throws. Next.js skips instrumentation's register()
 * during `next build`, so a throw here couldn't fail a deploy — it would
 * fire at runtime on every new server instance and take live requests down,
 * sticker pages included. Watch `/api/health?deep=1` and Sentry instead;
 * a deploy-time gate, if ever wanted, belongs in a prebuild script.
 */
export async function checkProductionEnv(): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") return;

  const missing = missingProductionEnvVars();
  if (missing.length === 0) return;

  const message = `Production is missing required configuration: ${missing.join(", ")}`;
  console.error(JSON.stringify({ event: "env_guard_failure", missing, message }));

  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureMessage(message, "error");
    } catch (err) {
      console.error("env_guard: failed to report to Sentry:", err);
    }
  }

}
