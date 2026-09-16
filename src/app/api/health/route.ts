import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv, missingProductionEnvVars } from "@/lib/env";
import { timingSafeEqualString } from "@/lib/timing-safe-equal";
import packageJson from "../../../../package.json";

// Always run this fresh — never cache a stale "ok". Node runtime: ?deep=1's
// auth check uses node:crypto (timingSafeEqualString).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_CHECK_TIMEOUT_MS = 5000;

async function checkSupabase(): Promise<"ok" | "error"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_CHECK_TIMEOUT_MS);

  try {
    // Anon key + a HEAD/count-only query against a real, RLS-protected
    // table. RLS means an anonymous caller sees 0 rows — that's expected
    // and fine; we're only confirming Supabase answers requests at all.
    const supabase = createClient(serverEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await supabase
      .from("companies")
      .select("id", { head: true, count: "exact" })
      .abortSignal(controller.signal);

    return error ? "error" : "ok";
  } catch {
    return "error";
  } finally {
    clearTimeout(timeout);
  }
}

/** True only for a well-formed `Authorization: Bearer <CRON_SECRET>` header, compared in constant time (C1-53/C1-54). */
function isAuthorizedForDeepCheck(request: Request): boolean {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  return !!expected && !!provided && timingSafeEqualString(provided, expected);
}

/**
 * Which integrations look configured — booleans only, never the values
 * themselves (C1-53/C1-54). productionReady reuses the exact list
 * checkProductionEnv() (instrumentation.ts) logs from at boot, so this
 * endpoint and that startup guard can never silently disagree about what
 * "ready" means.
 */
function deepChecks() {
  const missingInProduction = missingProductionEnvVars();
  return {
    productionReady: missingInProduction.length === 0,
    missingInProduction,
    appUrlConfigured: !missingInProduction.includes("NEXT_PUBLIC_APP_URL"),
    supabaseServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    resend: !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET,
    sentry: !!process.env.SENTRY_DSN,
    cronSecret: !!process.env.CRON_SECRET,
  };
}

export async function GET(request: Request) {
  const supabaseStatus = await checkSupabase();
  const ok = supabaseStatus === "ok";

  const body: Record<string, unknown> = {
    ok,
    version: packageJson.version,
    time: new Date().toISOString(),
    checks: {
      supabase: supabaseStatus,
    },
  };

  const wantsDeep = new URL(request.url).searchParams.get("deep") === "1";
  if (wantsDeep) {
    if (!isAuthorizedForDeepCheck(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    body.deep = deepChecks();
  }

  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
