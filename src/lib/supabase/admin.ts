import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS entirely. Server-only (the `server-only`
// import above makes bundling this into a client component a build error).
// Every tenant-scoped read/write goes through the RLS-protected client from
// ./server.ts instead — this is only for the rare case that has no caller
// tenant to scope to: the Stripe webhook route upserting `subscriptions`,
// and the platform admin's cross-company activation table
// (src/app/admin/page.tsx, gated by is_platform_admin() in its layout)
// reading equipment/scan_events/service_requests, which — unlike
// `companies`/`qr_codes` — have no platform-admin RLS policy of their own.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set to use the admin client"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
