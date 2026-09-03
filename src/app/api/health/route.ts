import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import packageJson from "../../../../package.json";

// Always run this fresh — never cache a stale "ok".
export const dynamic = "force-dynamic";

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

export async function GET() {
  const supabaseStatus = await checkSupabase();
  const ok = supabaseStatus === "ok";

  return NextResponse.json(
    {
      ok,
      version: packageJson.version,
      time: new Date().toISOString(),
      checks: {
        supabase: supabaseStatus,
      },
    },
    { status: ok ? 200 : 503 }
  );
}
