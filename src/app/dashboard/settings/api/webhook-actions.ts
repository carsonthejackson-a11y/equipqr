"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, type CurrentProfile } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_WEBHOOK_ENDPOINTS,
  isWebhookEventType,
  webhookUrlError,
  type WebhookEventType,
} from "@/lib/webhook-signing";
import { deliverAndReport, flushWebhooksSoon, generateWebhookSecret, getWebhookAdminClient } from "@/lib/webhooks";

// Server actions behind Settings → API → Webhooks. Kept apart from
// actions.ts (API keys) so the two features evolve independently.
//
// Every mutation is scoped by company_id in the query AND by the owner-only
// RLS policies from migration 0019. The endpoint `secret` is returned to the
// browser exactly once — from createWebhookEndpoint / rotateWebhookSecret —
// and is never selected anywhere else.

const SETTINGS_PATH = "/dashboard/settings/api";
const MAX_DESCRIPTION_LENGTH = 200;

async function requireWebhookOwner(): Promise<{ ctx: CurrentProfile } | { errorMessage: string }> {
  const ctx = await requireOwner();
  if (!ctx) {
    return { errorMessage: "Only owners can manage webhooks" };
  }
  const entitlements = await getEntitlements();
  if (!hasFeature(entitlements, "exportApi")) {
    return { errorMessage: "Webhooks are available on the Business plan. Upgrade to add endpoints." };
  }
  return { ctx };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Reads url / description / events off the dialog's FormData and validates
 * every wire value. `events` is the list of checked event types; the
 * "All events" toggle sends `allEvents=on`, which wins and stores [] (the
 * DB's "every event" sentinel).
 */
function parseEndpointForm(formData: FormData):
  | { url: string; description: string | null; events: WebhookEventType[] }
  | { error: string } {
  const url = String(formData.get("url") ?? "").trim();
  const urlProblem = webhookUrlError(url);
  if (urlProblem) {
    return { error: urlProblem };
  }

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters` };
  }

  let events: WebhookEventType[] = [];
  if (formData.get("allEvents") !== "on") {
    const seen = new Set<WebhookEventType>();
    for (const raw of formData.getAll("events")) {
      if (isWebhookEventType(raw) && raw !== "webhook.test") {
        seen.add(raw);
      }
    }
    events = [...seen];
    if (events.length === 0) {
      return { error: "Pick at least one event, or choose “All events”" };
    }
  }

  return { url, description: description || null, events };
}

async function countActiveEndpoints(companyId: string): Promise<{ count: number } | { error: string }> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("webhook_endpoints")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (error) {
    return { error: error.message };
  }
  return { count: count ?? 0 };
}

export async function createWebhookEndpoint(formData: FormData) {
  const guard = await requireWebhookOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  const parsed = parseEndpointForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const active = await countActiveEndpoints(ctx.company.id);
  if ("error" in active) {
    return { error: active.error };
  }
  if (active.count >= MAX_WEBHOOK_ENDPOINTS) {
    return {
      error: `You've reached the limit of ${MAX_WEBHOOK_ENDPOINTS} active endpoints. Disable or delete one first.`,
    };
  }

  const secret = generateWebhookSecret();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("webhook_endpoints").insert({
    company_id: ctx.company.id,
    url: parsed.url,
    description: parsed.description,
    secret,
    events: parsed.events,
    created_by: user?.id ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(SETTINGS_PATH);
  // The one and only time the signing secret crosses to the browser.
  return { success: true, secret };
}

export async function updateWebhookEndpoint(endpointId: string, formData: FormData) {
  const guard = await requireWebhookOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  if (!isUuid(endpointId)) {
    return { error: "Invalid endpoint" };
  }

  const parsed = parseEndpointForm(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .update({ url: parsed.url, description: parsed.description, events: parsed.events })
    .eq("id", endpointId)
    .eq("company_id", ctx.company.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Endpoint not found" };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

/** Issues a fresh signing secret; the old one stops verifying immediately. Returned once. */
export async function rotateWebhookSecret(endpointId: string) {
  const guard = await requireWebhookOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;

  if (!isUuid(endpointId)) {
    return { error: "Invalid endpoint" };
  }

  const secret = generateWebhookSecret();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .update({ secret })
    .eq("id", endpointId)
    .eq("company_id", ctx.company.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Endpoint not found" };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true, secret };
}

/**
 * Enables or disables an endpoint. Re-enabling also clears the auto-disable
 * bookkeeping (disabled_at, failure_count) so the endpoint gets a fresh 20
 * strikes; enabling counts against the active-endpoint limit.
 */
export async function setWebhookEndpointActive(endpointId: string, active: boolean) {
  if (!isUuid(endpointId) || typeof active !== "boolean") {
    return { error: "Invalid request" };
  }

  // Disabling is always allowed (a downgraded company must be able to turn
  // its endpoints off); enabling needs the plan, like creating one does.
  let ctx: CurrentProfile;
  if (active) {
    const guard = await requireWebhookOwner();
    if ("errorMessage" in guard) {
      return { error: guard.errorMessage };
    }
    ctx = guard.ctx;
  } else {
    const owner = await requireOwner();
    if (!owner) {
      return { error: "Only owners can manage webhooks" };
    }
    ctx = owner;
  }

  if (active) {
    const current = await countActiveEndpoints(ctx.company.id);
    if ("error" in current) {
      return { error: current.error };
    }
    if (current.count >= MAX_WEBHOOK_ENDPOINTS) {
      return {
        error: `You already have ${MAX_WEBHOOK_ENDPOINTS} active endpoints. Disable another one first.`,
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .update(active ? { is_active: true, disabled_at: null, failure_count: 0 } : { is_active: false })
    .eq("id", endpointId)
    .eq("company_id", ctx.company.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return { error: error.message };
  }
  if (!data) {
    return { error: "Endpoint not found" };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

export async function deleteWebhookEndpoint(endpointId: string) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage webhooks" };
  }
  if (!isUuid(endpointId)) {
    return { error: "Invalid endpoint" };
  }

  const supabase = await createClient();
  // Deliveries cascade with the endpoint (migration 0019).
  const { error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", endpointId)
    .eq("company_id", ctx.company.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

export type SendTestResult =
  | { error: string }
  | { success: true; queued: true }
  | { success: true; queued: false; delivered: boolean; status: number | null; error: string | null };

/**
 * Queues a synthetic `webhook.test` event at one endpoint (owner-checked
 * inside the RPC) and, when the service-role client is available, delivers
 * it right away so the UI can show the real outcome. Without it the row
 * waits for the next cron run.
 */
export async function sendWebhookTest(endpointId: string): Promise<SendTestResult> {
  const guard = await requireWebhookOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;
  if (!isUuid(endpointId)) {
    return { error: "Invalid endpoint" };
  }

  const supabase = await createClient();
  const { data: deliveryId, error } = await supabase.rpc("enqueue_webhook_test", { p_endpoint_id: endpointId });
  if (error) {
    return { error: error.message };
  }
  if (!isUuid(deliveryId)) {
    return { error: "Couldn't queue the test event" };
  }

  const admin = getWebhookAdminClient();
  if (!admin) {
    revalidatePath(SETTINGS_PATH);
    return { success: true, queued: true };
  }

  const outcome = await deliverAndReport(admin, { companyId: ctx.company.id, deliveryId });
  revalidatePath(SETTINGS_PATH);
  if (!outcome) {
    return { success: true, queued: true };
  }
  return { success: true, queued: false, delivered: outcome.ok, status: outcome.status, error: outcome.error };
}

/** Puts a `failed` delivery back in the queue with a fresh attempt budget (RPC from migration 0023). */
export async function retryWebhookDelivery(deliveryId: string) {
  const guard = await requireWebhookOwner();
  if ("errorMessage" in guard) {
    return { error: guard.errorMessage };
  }
  const { ctx } = guard;
  if (!isUuid(deliveryId)) {
    return { error: "Invalid delivery" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("retry_webhook_delivery", { p_delivery_id: deliveryId });
  if (error) {
    return { error: error.message };
  }
  if (data !== true) {
    return { error: "Only failed deliveries can be retried" };
  }

  // Goes out right after this response, like any other event; the cron
  // catches it otherwise.
  flushWebhooksSoon(ctx.company.id);
  revalidatePath(SETTINGS_PATH);
  return { success: true };
}
