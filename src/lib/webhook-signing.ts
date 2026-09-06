// Pure, framework-free half of outbound webhooks: the event catalogue, the
// signature scheme, and the retry policy constants that mirror migration
// 0019's finish_webhook_delivery(). Nothing here touches the network or the
// database, so it's unit-tested in webhook-signing.test.ts and safe to import
// from client components (the settings UI needs the catalogue).

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Every event type an endpoint can subscribe to, with the label the settings
 * page shows. Keep in sync with the trigger mappings in migration 0019 and
 * the "Webhooks" section of docs/API.md.
 */
export const WEBHOOK_EVENT_TYPES = {
  "equipment.created": "Equipment added",
  "equipment.updated": "Equipment details updated",
  "equipment.status_changed": "Equipment status changed",
  "equipment.note_added": "Timeline note added",
  "equipment.code_changed": "QR code assigned / replaced / retired / moved",
  "visit.scheduled": "Visit scheduled",
  "visit.completed": "Service logged",
  "maintenance.due": "Preventive maintenance due",
  "service_request.created": "Service request submitted",
  "service_request.status_changed": "Request status changed",
  "service_request.assigned": "Request assigned",
  "service_request.priority_changed": "Request priority changed",
  "service_request.note": "Customer-visible note added",
  "service_request.customer_message": "Customer replied",
  "service_request.resolved": "Request resolved",
  "webhook.test": "Test event",
} as const;

export type WebhookEventType = keyof typeof WEBHOOK_EVENT_TYPES;

/** The subscribable types, in display order (webhook.test is always delivered, never subscribed). */
export const SUBSCRIBABLE_WEBHOOK_EVENTS = (Object.keys(WEBHOOK_EVENT_TYPES) as WebhookEventType[]).filter(
  (type) => type !== "webhook.test"
);

export function isWebhookEventType(value: unknown): value is WebhookEventType {
  return typeof value === "string" && value in WEBHOOK_EVENT_TYPES;
}

export function webhookEventLabel(type: string): string {
  return (WEBHOOK_EVENT_TYPES as Record<string, string>)[type] ?? type;
}

/** Max active endpoints per company. */
export const MAX_WEBHOOK_ENDPOINTS = 10;

/** Per-request timeout for one delivery attempt. Endpoints should ack fast and process async. */
export const WEBHOOK_TIMEOUT_MS = 10_000;

/** Prefix on every secret, so one is recognisable in a config file. */
export const WEBHOOK_SECRET_PREFIX = "whsec_";

/** Signature header value: `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">`. */
export const WEBHOOK_SIGNATURE_HEADER = "X-EquipQR-Signature";
export const WEBHOOK_EVENT_HEADER = "X-EquipQR-Event";
export const WEBHOOK_DELIVERY_HEADER = "X-EquipQR-Delivery";

/** Receivers should reject signatures whose timestamp is older than this (replay protection). */
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function computeWebhookSignature(secret: string, timestampSeconds: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
}

/** Builds the full header value for one delivery. */
export function buildSignatureHeader(secret: string, body: string, now: Date = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  return `t=${t},v1=${computeWebhookSignature(secret, t, body)}`;
}

/**
 * Reference verifier for receivers (documented in docs/API.md and used by the
 * tests to prove the sender and verifier agree). Constant-time comparison,
 * timestamp tolerance, tolerant of extra `v2=` style fields.
 */
export function verifyWebhookSignature(params: {
  secret: string;
  header: string | null | undefined;
  body: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const { secret, header, body } = params;
  if (!header) return false;

  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=", 2);
    if (key && value) parts.set(key.trim(), value.trim());
  }

  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isFinite(t) || !v1) return false;

  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const tolerance = params.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - t) > tolerance) return false;

  const expected = computeWebhookSignature(secret, t, body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a URL may be registered as an endpoint. https only, no
 * credentials in the URL, no obviously-internal hosts. (The database CHECK
 * enforces https too; this gives the form a friendlier message first.)
 */
export function webhookUrlError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Enter a full URL, e.g. https://example.com/hooks/equipqr";
  }
  if (url.protocol !== "https:") return "Webhook URLs must use https://";
  if (url.username || url.password) return "Don't put credentials in the URL — use the signing secret instead";
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "[::1]" ||
    host === "::1"
  ) {
    return "That host isn't reachable from EquipQR's servers";
  }
  if (raw.length > 2000) return "URL is too long";
  return null;
}
