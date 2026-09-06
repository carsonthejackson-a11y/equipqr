import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMEOUT_MS,
  buildSignatureHeader,
} from "@/lib/webhook-signing";
import type { WebhookDelivery } from "@/lib/types";

// The deliverer for outbound webhooks (Business plan). Migration 0019 fills
// the `webhook_deliveries` outbox from triggers on equipment_events and
// request_activity; this module drains it:
//
//   - claim_webhook_deliveries() leases a batch (bumping attempts and pushing
//     next_attempt_at out so two workers never double-send),
//   - each row is POSTed with an HMAC signature and a hard timeout,
//   - finish_webhook_delivery() records the outcome, schedules the retry
//     (1m → 5m → 30m → 2h, 5 attempts) and auto-disables an endpoint after
//     20 consecutive failures.
//
// Two workers call it: the 5-minute cron (/api/cron/webhooks) and
// flushWebhooksSoon(), which server actions/route handlers trigger through
// next's after() so a delivery usually goes out within a second of the
// event, without ever delaying the response the user is waiting on.
//
// Everything runs through the SERVICE-ROLE client: staff have no write
// access to the outbox by design (RLS), and there is no user session in a
// cron anyway.

/** Generates a new endpoint secret. Shown once at creation, stored in clear for signing. */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString("base64url")}`;
}

type EndpointForDelivery = { id: string; url: string; secret: string; is_active: boolean };

export type DeliveryOutcome = {
  deliveryId: string;
  endpointId: string;
  eventType: string;
  ok: boolean;
  status: number | null;
  error: string | null;
};

export type DrainResult = {
  claimed: number;
  delivered: number;
  failed: number;
  outcomes: DeliveryOutcome[];
};

/**
 * Sends one delivery and returns what happened. Exported for the "send test"
 * action, which wants a synchronous answer for the UI. Never throws.
 */
export async function attemptDelivery(
  delivery: Pick<WebhookDelivery, "id" | "event_type" | "payload">,
  endpoint: Pick<EndpointForDelivery, "url" | "secret">,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const body = JSON.stringify(delivery.payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "EquipQR-Webhooks/1.0",
        [WEBHOOK_EVENT_HEADER]: delivery.event_type,
        [WEBHOOK_DELIVERY_HEADER]: delivery.id,
        [WEBHOOK_SIGNATURE_HEADER]: buildSignatureHeader(endpoint.secret, body),
      },
      body,
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });

    const ok = response.status >= 200 && response.status < 300;
    let error: string | null = null;
    if (!ok) {
      // A short excerpt of the response helps the owner debug from the log
      // without us storing arbitrary amounts of someone else's output.
      try {
        const text = await response.text();
        error = `HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
      } catch {
        error = `HTTP ${response.status}`;
      }
    }
    return { ok, status: response.status, error };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${WEBHOOK_TIMEOUT_MS / 1000}s`
          : err.message
        : String(err);
    return { ok: false, status: null, error: message.slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Leases due deliveries (optionally for one company) and works through them.
 * Safe to run concurrently with itself. Returns a summary for the cron
 * response / logs. Never throws — a webhook problem is never the caller's.
 */
export async function drainWebhookDeliveries(
  admin: SupabaseClient,
  options: { limit?: number; companyId?: string | null; fetchImpl?: typeof fetch } = {}
): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, delivered: 0, failed: 0, outcomes: [] };

  const { data, error } = await admin.rpc("claim_webhook_deliveries", {
    p_limit: options.limit ?? 50,
    p_company_id: options.companyId ?? null,
  });
  if (error) {
    console.error("claim_webhook_deliveries failed:", error.message);
    return result;
  }

  const deliveries = (data as WebhookDelivery[] | null) ?? [];
  result.claimed = deliveries.length;
  if (deliveries.length === 0) return result;

  const endpointIds = [...new Set(deliveries.map((d) => d.endpoint_id))];
  const { data: endpointRows, error: endpointError } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, is_active")
    .in("id", endpointIds)
    .returns<EndpointForDelivery[]>();
  if (endpointError) {
    console.error("webhook endpoints lookup failed:", endpointError.message);
    return result;
  }
  const endpointById = new Map((endpointRows ?? []).map((e) => [e.id, e]));

  for (const delivery of deliveries) {
    const endpoint = endpointById.get(delivery.endpoint_id);

    let outcome: { ok: boolean; status: number | null; error: string | null };
    if (!endpoint) {
      outcome = { ok: false, status: null, error: "Endpoint no longer exists" };
    } else if (!endpoint.is_active) {
      // Disabled after we queued this — don't keep knocking. Mark it failed
      // via a null status so the log says why.
      outcome = { ok: false, status: null, error: "Endpoint is disabled" };
    } else {
      outcome = await attemptDelivery(delivery, endpoint, options.fetchImpl);
    }

    const { error: finishError } = await admin.rpc("finish_webhook_delivery", {
      p_delivery_id: delivery.id,
      p_response_status: outcome.status,
      p_error: outcome.error,
    });
    if (finishError) {
      console.error("finish_webhook_delivery failed:", finishError.message);
    }

    if (outcome.ok) result.delivered += 1;
    else result.failed += 1;
    result.outcomes.push({
      deliveryId: delivery.id,
      endpointId: delivery.endpoint_id,
      eventType: delivery.event_type,
      ...outcome,
    });
  }

  return result;
}

/** Once per server process, not once per event. */
let warnedNoServiceRole = false;

function adminClientOrNull(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch {
    if (!warnedNoServiceRole) {
      warnedNoServiceRole = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not configured — webhook deliveries will wait for the cron job (which also needs it)."
      );
    }
    return null;
  }
}

/**
 * Ask for this company's outbox to be drained after the current response is
 * sent. Called from emitEquipmentEvent() / emitRequestActivity(), i.e. from
 * inside server actions and route handlers where next's after() is
 * available; anywhere else (a unit test, a script) it quietly does nothing
 * and the cron catches up.
 */
export function flushWebhooksSoon(companyId: string): void {
  try {
    after(async () => {
      const admin = adminClientOrNull();
      if (!admin) return;
      try {
        await drainWebhookDeliveries(admin, { companyId, limit: 25 });
      } catch (err) {
        console.error("webhook flush failed:", err);
      }
    });
  } catch {
    // after() throws outside a request scope. The cron will deliver instead.
  }
}
