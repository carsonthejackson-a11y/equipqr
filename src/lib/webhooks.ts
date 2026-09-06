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

/** Most of a failed response body we ever read (the log keeps 200 chars of it). */
const MAX_ERROR_BODY_BYTES = 4096;

/** How many endpoints one drain works at once. Each endpoint's rows stay sequential (ordered delivery). */
const DEFAULT_CONCURRENCY = 5;

/**
 * Reads at most `limit` bytes of a response body, then cancels the stream.
 * Never throws — a body that can't be read just yields an empty excerpt.
 */
async function readBodyExcerpt(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    try {
      return (await response.text()).slice(0, limit);
    } catch {
      return "";
    }
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < limit) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } catch {
    // Partial excerpt is fine.
  } finally {
    reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(Math.min(received, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.max(0, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= merged.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export type DeliveryOutcome = {
  deliveryId: string;
  endpointId: string;
  eventType: string;
  ok: boolean;
  status: number | null;
  error: string | null;
};

/**
 * Sends one delivery and returns what happened. Exported for the "send test"
 * path, which wants a synchronous answer for the UI. Never throws.
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
      // without us storing arbitrary amounts of someone else's output — and
      // without reading it all: a hostile endpoint can stream gigabytes.
      const text = await readBodyExcerpt(response, MAX_ERROR_BODY_BYTES);
      error = `HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
    } else {
      // Don't hold the connection open for a body we never look at.
      response.body?.cancel().catch(() => {});
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

export type DrainResult = {
  claimed: number;
  delivered: number;
  failed: number;
  /** Leased rows handed back untouched because the time budget ran out. */
  released: number;
  outcomes: DeliveryOutcome[];
};

export type DrainOptions = {
  /** Max rows to lease this run (the RPC also caps each endpoint at 25 per claim). */
  limit?: number;
  /** Drain one company only — what flushWebhooksSoon() does right after an event. */
  companyId?: string | null;
  /** Endpoints worked in parallel. Rows for one endpoint always go out in order. */
  concurrency?: number;
  /**
   * Wall-clock budget in ms. Rows not attempted by then are released back to
   * the queue (attempt refunded, due immediately) so a slow tenant can't
   * make everyone else's retries burn through their attempts.
   */
  deadlineMs?: number;
  fetchImpl?: typeof fetch;
};

/**
 * Leases due deliveries (optionally for one company) and works through them:
 * grouped by endpoint, endpoints in parallel, each endpoint's rows in order.
 * Safe to run concurrently with itself. Returns a summary for the cron
 * response / logs. Never throws — a webhook problem is never the caller's.
 */
export async function drainWebhookDeliveries(
  admin: SupabaseClient,
  options: DrainOptions = {}
): Promise<DrainResult> {
  const result: DrainResult = { claimed: 0, delivered: 0, failed: 0, released: 0, outcomes: [] };

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
    // The lease expires on its own in 5 minutes; hand the rows back now so
    // the attempt isn't charged for a lookup that never reached the endpoint.
    await releaseDeliveries(admin, deliveries.map((d) => d.id), result);
    return result;
  }
  const endpointById = new Map((endpointRows ?? []).map((e) => [e.id, e]));

  // One queue per endpoint, in claim order, so a receiver sees events in the
  // order they happened even when we fan out across endpoints.
  const groups = new Map<string, WebhookDelivery[]>();
  for (const d of deliveries) {
    const list = groups.get(d.endpoint_id);
    if (list) list.push(d);
    else groups.set(d.endpoint_id, [d]);
  }
  const queue = [...groups.values()];
  const unattempted = new Set(deliveries.map((d) => d.id));
  const deadline = options.deadlineMs ? Date.now() + options.deadlineMs : null;
  const outOfTime = () => deadline !== null && Date.now() >= deadline;

  const runOne = async (delivery: WebhookDelivery) => {
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
    unattempted.delete(delivery.id);

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
  };

  const worker = async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      for (const delivery of group) {
        if (outOfTime()) return;
        await runOne(delivery);
      }
    }
  };

  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, queue.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (unattempted.size > 0) {
    await releaseDeliveries(admin, [...unattempted], result);
  }

  return result;
}

/** Hands leased-but-unattempted rows back to the queue (migration 0025). Best-effort. */
async function releaseDeliveries(admin: SupabaseClient, ids: string[], result: DrainResult): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await admin.rpc("release_webhook_deliveries", { p_ids: ids });
  if (error) {
    console.error("release_webhook_deliveries failed:", error.message);
    return;
  }
  result.released += typeof data === "number" ? data : ids.length;
}

/** How long an after() flush may spend before handing the rest to the cron. */
const FLUSH_BUDGET_MS = 20_000;

/** Once per server process, not once per event. */
let warnedNoServiceRole = false;

/**
 * The service-role client the deliverer runs on, or null when
 * SUPABASE_SERVICE_ROLE_KEY isn't configured (warns once). Used by
 * flushWebhooksSoon() and by the settings page's "Send test" action, which
 * wants to deliver synchronously and report the result — falling back to
 * "queued for the cron" when there is no admin client.
 */
export function getWebhookAdminClient(): SupabaseClient | null {
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

const adminClientOrNull = getWebhookAdminClient;

/**
 * Delivers ONE specific row (typically the test event that was just
 * enqueued) and returns its outcome, without touching the rest of the
 * company's backlog — a "Send test" click must never wait on someone else's
 * retries. Leases exactly that row through claim_webhook_delivery()
 * (migration 0025) so a concurrent flush can't double-send it. Null means
 * it wasn't claimable (already leased, already delivered, not due); the
 * cron / flush will report on it instead. Never throws.
 */
export async function deliverAndReport(
  admin: SupabaseClient,
  options: { companyId: string; deliveryId: string; fetchImpl?: typeof fetch }
): Promise<DeliveryOutcome | null> {
  const { data, error } = await admin.rpc("claim_webhook_delivery", { p_delivery_id: options.deliveryId });
  if (error) {
    console.error("claim_webhook_delivery failed:", error.message);
    return null;
  }
  const rows = (data as WebhookDelivery[] | null) ?? [];
  const delivery = rows.find((d) => d.company_id === options.companyId);
  if (!delivery) return null;

  const { data: endpoint, error: endpointError } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, is_active")
    .eq("id", delivery.endpoint_id)
    .maybeSingle<EndpointForDelivery>();

  let outcome: { ok: boolean; status: number | null; error: string | null };
  if (endpointError || !endpoint) {
    outcome = { ok: false, status: null, error: "Endpoint no longer exists" };
  } else if (!endpoint.is_active) {
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

  return {
    deliveryId: delivery.id,
    endpointId: delivery.endpoint_id,
    eventType: delivery.event_type,
    ...outcome,
  };
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
        await drainWebhookDeliveries(admin, { companyId, limit: 25, deadlineMs: FLUSH_BUDGET_MS });
      } catch (err) {
        console.error("webhook flush failed:", err);
      }
    });
  } catch {
    // after() throws outside a request scope. The cron will deliver instead.
  }
}
