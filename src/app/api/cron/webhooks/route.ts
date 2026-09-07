import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { drainWebhookDeliveries } from "@/lib/webhooks";

// Needs the Node runtime: the service-role admin client and node:crypto
// (HMAC signing in src/lib/webhook-signing.ts).
export const runtime = "nodejs";
// Vercel kills the function at maxDuration; the drain stops itself a little
// earlier (DRAIN_BUDGET_MS) and hands unattempted rows back to the queue.
export const maxDuration = 60;

/** How many due deliveries one cron run works through. */
const BATCH_LIMIT = 200;
/** Wall-clock budget for the drain, under maxDuration with room for the prune. */
const DRAIN_BUDGET_MS = 45_000;

/**
 * Every-5-minutes job (see vercel.json) that drains the outbound webhook
 * outbox: whatever flushWebhooksSoon() didn't send right after the event
 * (a missing service-role key at that moment, a crashed after() callback,
 * retries whose backoff has elapsed) goes out here, then rows older than
 * 30 days are pruned. Vercel Cron calls this with a GET and an
 * `Authorization: Bearer <CRON_SECRET>` header; anything else is rejected.
 *
 * Never throws: a webhook problem must not page anyone through a 500 —
 * the summary in the JSON body (and the logs) say what happened.
 */
export async function GET(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured — the webhook deliverer needs the service-role client to lease and update the outbox.",
      },
      { status: 503 }
    );
  }

  const summary = { claimed: 0, delivered: 0, failed: 0, released: 0, pruned: 0 };

  try {
    const result = await drainWebhookDeliveries(admin, { limit: BATCH_LIMIT, deadlineMs: DRAIN_BUDGET_MS });
    summary.claimed = result.claimed;
    summary.delivered = result.delivered;
    summary.failed = result.failed;
    summary.released = result.released;
  } catch (err) {
    console.error("webhooks cron: drain failed:", err);
  }

  try {
    const { data, error } = await admin.rpc("prune_webhook_deliveries");
    if (error) {
      console.error("webhooks cron: prune_webhook_deliveries failed:", error.message);
    } else if (typeof data === "number") {
      summary.pruned = data;
    }
  } catch (err) {
    console.error("webhooks cron: prune failed:", err);
  }

  return NextResponse.json(summary);
}
