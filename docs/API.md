# EquipQR v1 API & data export

Business-plan features: programmatic access to your equipment, customers, and service
requests (`/api/v1/*`), plus one-click CSV export (`/api/export/*`). Both are gated by the
`exportApi` plan feature (`src/lib/plans.ts`) — Starter and Pro accounts get a 403 pointing at
the Billing page.

Manage API keys and trigger CSV downloads from **Settings → API**
(`/dashboard/settings/api`).

## Authentication

Every `/api/v1/*` request needs an API key in the `Authorization` header:

```
Authorization: Bearer eqr_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Create a key on **Settings → API**. The plaintext key is shown exactly once, right after
creation — EquipQR stores only its sha256 hash, so if you lose it you have to revoke it and
create a new one. A key has one or two scopes:

- **read** — every `GET` endpoint below. Every key has this.
- **write** — required for `PATCH /api/v1/service-requests/:id`. Opt in per key when you
  create it.

A company can have at most **10 active keys** at once; revoke one to make room for another.
A revoked key (or one that never existed) gets `401 { "error": "Invalid or revoked API key." }`
on every request, immediately.

There is no session or cookie involved — a key is scoped to exactly one company
(`auth.ctx.companyId` in every handler), and that scoping is enforced entirely by the API
layer filtering every database query by company id (API requests use the Postgres
service-role client, which bypasses row-level security — see the comment at the top of every
route file under `src/app/api/v1/`).

## Rate limits

600 requests per key per rolling 60-second window (`RATE_LIMITS.apiKey` in
`src/lib/rate-limit.ts`). Over the limit gets:

```
HTTP 429
Retry-After: 60
{ "error": "Rate limit exceeded." }
```

## Pagination

Every list endpoint returns:

```json
{ "data": [ ... ], "next_cursor": "eyJzb3J0VmFsdWUiOi..." }
```

`next_cursor` is `null` when there's no more data. To fetch the next page, pass it back as
`?cursor=...` on the same request (same filters). `next_cursor` is an opaque token — don't
parse it, just round-trip it.

- `?limit=` — page size, default 50, max 200. Values outside that range are clamped, not
  rejected.
- Lists are sorted newest first (`created_at desc`, `scanned_at desc` for scan events), with
  `id` as a tie-breaker.

```bash
curl -s "https://app.equipqr.co/api/v1/equipment?limit=25" \
  -H "Authorization: Bearer eqr_live_..." | jq
# { "data": [...], "next_cursor": "eyJ..." }

curl -s "https://app.equipqr.co/api/v1/equipment?limit=25&cursor=eyJ..." \
  -H "Authorization: Bearer eqr_live_..."
```

## Errors

Every error response is `{ "error": "<message>" }` with a matching HTTP status:

| Status | Meaning |
|---|---|
| 400 | Bad request — missing/invalid filter, malformed JSON body, invalid PATCH field |
| 401 | Missing, malformed, unknown, or revoked API key |
| 403 | Key is missing the required scope, or your plan doesn't include API access |
| 404 | Resource not found (or belongs to a different company — same response either way) |
| 429 | Rate limit exceeded (`Retry-After` header set) |
| 500 | Unexpected database error |
| 503 | API access isn't configured on this server (`SUPABASE_SERVICE_ROLE_KEY` unset) |

All responses (success and error) are sent with `Cache-Control: no-store`.

## What's never returned

`notification_email`, Stripe customer/subscription ids, `key_hash`, and internal profile
emails never appear in any v1 API response — those stay dashboard-only. A service request's
`public_token` *is* returned, but always as a ready-to-use link — `status_url` — rather than
the bare token. `priority_rank` is also withheld: it's a generated sort key, an internal
implementation detail rather than part of this contract.

## Endpoints

### `GET /api/v1/me`

Confirms a key works and shows what it can do. Not paginated — a single object, not the
`{ data, next_cursor }` list shape.

```bash
curl -s https://app.equipqr.co/api/v1/me -H "Authorization: Bearer eqr_live_..."
```

```json
{ "company": { "id": "...", "name": "Acme HVAC" }, "scopes": ["read"] }
```

### `GET /api/v1/equipment`

Filters: `customer_id`, `status` (`active` | `needs_service` | `out_of_service` | `retired`),
`updated_since` (ISO timestamp).

```bash
curl -s "https://app.equipqr.co/api/v1/equipment?status=needs_service" \
  -H "Authorization: Bearer eqr_live_..."
```

Each row is the equipment record plus `photo_url` (absolute URL into the public
`company-assets` bucket, or `null`).

Rows also carry the preventive-maintenance and custom-field columns as stored:
`service_interval_days` (integer days or `null`), `next_service_due_on` (`YYYY-MM-DD` or
`null` — computed from the last service when an interval is set, otherwise hand-entered), and
`custom_fields` (an object keyed by the custom field `key` defined under Settings → Custom fields,
e.g. `{ "filter_size": "20x25", "has_drain_pan": true }`; keys without a value are absent).

### `GET /api/v1/equipment/:id`

Adds the unit's active QR code, document metadata, and its last 20 timeline events.

```bash
curl -s https://app.equipqr.co/api/v1/equipment/EQUIPMENT_ID \
  -H "Authorization: Bearer eqr_live_..."
```

```json
{
  "data": {
    "id": "...", "name": "Espresso Machine #12", "status": "active", "...": "...",
    "photo_url": "https://.../company-assets/...",
    "code": { "short_code": "ABCD-2345", "public_url": "https://app.equipqr.co/e/ABCD2345" },
    "documents": [{ "id": "...", "file_name": "manual.pdf", "mime_type": "application/pdf", "size_bytes": 40213, "created_at": "..." }],
    "events": [{ "id": "...", "kind": "request_resolved", "summary": "...", "occurred_at": "..." }]
  }
}
```

### `GET /api/v1/customers`

No filters beyond pagination.

### `GET /api/v1/customers/:id`

Single customer record.

### `GET /api/v1/service-requests`

Filters: `status` (`new` | `in_progress` | `scheduled` | `on_hold` | `resolved` | `canceled`),
`priority` (`low` | `normal` | `high` | `urgent`), `equipment_id`, `customer_id`,
`updated_since`.

```bash
curl -s "https://app.equipqr.co/api/v1/service-requests?status=new&priority=urgent" \
  -H "Authorization: Bearer eqr_live_..."
```

Each row replaces `public_token` with `status_url` (the ready-to-share `/r/<token>` link).

### `GET /api/v1/service-requests/:id`

Adds the full activity feed (`activity`) — both `visibility: "internal"` (staff notes/audit)
and `visibility: "customer"` (what the requester sees on their status page) rows, since a key
already has full staff-level access to its company's data.

### `PATCH /api/v1/service-requests/:id`

Requires the **write** scope. Body is a partial update — send only the fields you're
changing:

```bash
curl -s -X PATCH https://app.equipqr.co/api/v1/service-requests/REQUEST_ID \
  -H "Authorization: Bearer eqr_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "status": "in_progress", "assigned_to": "PROFILE_ID" }'
```

| Field | Type | Notes |
|---|---|---|
| `status` | string | One of the status values above |
| `priority` | string | One of the priority values above |
| `assigned_to` | string \| null | Must be a profile id belonging to your company; `null` unassigns |

At least one field is required. Every changed field appends a `request_activity` row
(`author_kind: "system"`, `metadata: { "via": "api", "from": ..., "to": ... }`) so the change
shows up in the dashboard's activity feed exactly like a staff edit — status changes are
customer-visible (they show on `/r/<token>`), priority/assignment changes are internal-only.
Setting `status` to `"resolved"` also stamps `resolved_at` and the unit's `last_serviced_at`
automatically (the same DB trigger the dashboard uses).

A **status** change also emails the requester the same branded status-update email the
dashboard sends, when the company has customer updates enabled and the requester left an
email address. It's sent after the response is returned, so it never adds latency to your
call, and a failed send is logged rather than surfaced as an error.

Returns the updated request in the same shape as the `GET` endpoint (minus `activity`).

### `GET /api/v1/scan-events`

Filters: `equipment_id`, `since` (ISO timestamp; defaults to 90 days ago if omitted).

```bash
curl -s "https://app.equipqr.co/api/v1/scan-events?equipment_id=EQUIPMENT_ID" \
  -H "Authorization: Bearer eqr_live_..."
```

## CSV export

`GET /api/export/:entity` — session-authenticated (any signed-in staff member, not just
owners), not API-key authenticated. Click the buttons on **Settings → API → Data export**, or
hit the route directly while signed in to the dashboard in a browser.

| `:entity` | Contents |
|---|---|
| `equipment` | Every v2 field, plus type name, customer name, and active QR short code |
| `customers` | Full customer records |
| `service-requests` | Every field, plus equipment/customer/assignee names |
| `scan-events` | Last 90 days only |

Response is `text/csv` with a UTF-8 BOM (opens cleanly in Excel) and
`Content-Disposition: attachment; filename="equipqr-<entity>-<YYYY-MM-DD>.csv"`. See
`src/lib/csv-export.ts` for the RFC 4180 encoding rules (fields are quoted only when they
contain a comma, quote, or newline).

## Webhooks

Outbound webhooks (Business plan) push an HTTPS `POST` to your systems the moment something
changes in EquipQR — a customer submits a request, a technician changes its status, a unit is
retagged — so you don't have to poll the v1 API. Owners manage endpoints under
**Settings → API → Webhooks**: add up to 10 active endpoints, pick which events each one
receives, send a test event, rotate the signing secret, and see the last 20 deliveries with
their HTTP status and error excerpt (failed ones can be retried from there).

Endpoints must be `https://` and publicly reachable; the signing secret (`whsec_…`) is shown
exactly once when the endpoint is created (or rotated) — store it like an API key.

### Event catalogue

Events come from the same per-unit timeline (`equipment_events`) and per-request activity feed
(`request_activity`) the dashboard shows. Subscribe to specific types, or leave the selection
empty to receive everything.

| Type | Fires when |
|---|---|
| `equipment.created` | A unit is added (form, CSV import, or API) |
| `equipment.updated` | A unit's details are edited |
| `equipment.status_changed` | A unit's status changes (active / needs service / out of service / retired) |
| `equipment.note_added` | Staff add a note to a unit's timeline |
| `equipment.code_changed` | A QR code is assigned, replaced, retired, or moved to another unit |
| `visit.scheduled` | A visit is booked or rescheduled on a request |
| `visit.completed` | Service is logged against a unit |
| `maintenance.due` | Preventive maintenance comes due for a unit (daily reminder job) |
| `service_request.created` | A customer submits a service request |
| `service_request.status_changed` | A request's status changes (dashboard or `PATCH /api/v1/service-requests/:id`) |
| `service_request.assigned` | A request is assigned or reassigned |
| `service_request.priority_changed` | A request's priority changes |
| `service_request.note` | Staff add a **customer-visible** note to a request |
| `service_request.customer_message` | The customer replies on the public status page |
| `service_request.resolved` | A request is resolved |
| `webhook.test` | You click **Send test** on an endpoint (always delivered, never subscribed) |

**What never leaves your tenant**: internal (staff-only) notes, email audit rows, and system
bookkeeping rows are not turned into events, and a payload never contains data from another
company.

### Payload

Every delivery is a JSON body with the same envelope; `data` depends on the type.

```json
{
  "id": "6f0e3d7a-3c2b-4f4e-9a1d-2d0e2b6e2a11",
  "type": "<event type>",
  "created_at": "2026-09-06T14:03:11.482Z",
  "company_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "data": { }
}
```

`id` is unique per **event** — the same event delivered to two endpoints (or retried) carries
the same `id`, so use it to de-duplicate. `X-EquipQR-Delivery` (below) is unique per delivery.

**Equipment events** (`equipment.*`, `visit.*`, `maintenance.due`,
`service_request.created`, `service_request.resolved`) carry the unit, the request when the
event belongs to one, and the timeline row itself:

```json
{
  "id": "6f0e3d7a-3c2b-4f4e-9a1d-2d0e2b6e2a11",
  "type": "equipment.status_changed",
  "created_at": "2026-09-06T14:03:11.482Z",
  "company_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "data": {
    "equipment": {
      "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "name": "La Marzocco #1",
      "status": "needs_service",
      "make": "La Marzocco",
      "model": "Linea PB",
      "serial_number": "LM-2291",
      "location": "Bar, left of the grinder",
      "customer_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
      "equipment_type_id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      "last_serviced_at": "2026-06-01T09:30:00Z",
      "next_service_due_on": "2026-08-30"
    },
    "service_request": null,
    "event": {
      "id": "0b7f7c2e-2a4b-4b8e-8a6d-1c3e5f7a9b21",
      "kind": "status_changed",
      "summary": "Status: Active → Needs service",
      "details": { "from": "active", "to": "needs_service" },
      "actor_kind": "staff",
      "occurred_at": "2026-09-06T14:03:11.482Z"
    }
  }
}
```

**Request events** (`service_request.status_changed`, `.assigned`, `.priority_changed`,
`.note`, `.customer_message`) carry the request (with a short equipment summary) and the
activity row:

```json
{
  "id": "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
  "type": "service_request.status_changed",
  "created_at": "2026-09-06T15:20:41.007Z",
  "company_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "data": {
    "service_request": {
      "id": "77777777-7777-7777-7777-777777777777",
      "status": "in_progress",
      "priority": "high",
      "assigned_to": "11111111-1111-1111-1111-111111111111",
      "scheduled_for": "2026-09-08T13:00:00Z",
      "contact_name": "Bob",
      "created_at": "2026-09-06T11:02:00Z",
      "equipment": {
        "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "name": "La Marzocco #1",
        "status": "needs_service",
        "customer_id": "cccccccc-cccc-cccc-cccc-cccccccccccc"
      }
    },
    "activity": {
      "id": "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7",
      "kind": "status_change",
      "body": "Status changed from New to In progress",
      "metadata": { "from": "new", "to": "in_progress" },
      "author_kind": "staff",
      "created_at": "2026-09-06T15:20:41.007Z"
    }
  }
}
```

`webhook.test` carries `data: { "message": "Hello from EquipQR — your webhook endpoint is wired up." }`.

### Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `EquipQR-Webhooks/1.0` |
| `X-EquipQR-Event` | The event type, e.g. `service_request.created` |
| `X-EquipQR-Delivery` | Unique id of this delivery attempt's row (same across retries of one delivery) |
| `X-EquipQR-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>` — see below |

### Verifying the signature

The signature is `HMAC-SHA256(secret, "<t>.<raw request body>")`, hex-encoded, where `t` is the
Unix timestamp (seconds) at which EquipQR signed the delivery. Verify against the **raw** body
bytes — don't re-serialise the parsed JSON — and reject signatures whose `t` is more than
**5 minutes** from your clock (replay protection). Compare in constant time.

```js
// Node 18+ (Express-style handler with the raw body available as a string/Buffer)
import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 5 * 60;

export function verifyEquipQrSignature({ secret, header, rawBody, now = Date.now() }) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((piece) => piece.split("=", 2).map((s) => s.trim()))
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(Math.floor(now / 1000) - t) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parts.v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// app.post("/hooks/equipqr", express.raw({ type: "application/json" }), (req, res) => {
//   if (!verifyEquipQrSignature({
//     secret: process.env.EQUIPQR_WEBHOOK_SECRET,
//     header: req.get("X-EquipQR-Signature"),
//     rawBody: req.body.toString("utf8"),
//   })) return res.status(401).end();
//   const event = JSON.parse(req.body);
//   res.status(204).end();           // ack fast, process asynchronously
// });
```

This mirrors EquipQR's own reference verifier (`verifyWebhookSignature` in
`src/lib/webhook-signing.ts`); the unit tests prove the sender and this verifier agree.

### Delivery, timing, and retries

- **Respond fast**: any `2xx` within **10 seconds** counts as delivered. Anything else — a
  non-2xx status, a redirect (not followed), a timeout, a connection error — is a failed
  attempt. Do your real work after acknowledging.
- **Timing**: an event is usually delivered within a second or two of the change — the app
  drains the outbox right after the response that caused it (Next's `after()`). Anything that
  misses that (retries, a busy moment) goes out with the **`/api/cron/webhooks` job, which
  runs every 5 minutes**. Deliveries are ordered by due time, not strictly by event time.
- **Retries**: a failed delivery is retried after **1 minute, then 5 minutes, 30 minutes, and
  2 hours** — five attempts in total — after which it is marked `failed` and shown in the
  settings page with the last HTTP status and a short excerpt of the response body. Owners
  can re-queue a failed delivery from there.
- **Auto-disable**: after **20 consecutive failed attempts** an endpoint is disabled
  (`Disabled` badge on the settings page) and stops receiving new events. Fix the receiver,
  then re-enable it from **Settings → API → Webhooks** — this resets the failure counter.
  Deliveries queued while an endpoint is disabled fail with "Endpoint is disabled".
- **Ordering & duplicates**: deliveries can arrive out of order and, rarely, more than once
  (e.g. a receiver that timed out after processing). Key your handling on the event `id`.
- **Retention**: the delivery log is kept for 30 days.
- **Privacy**: internal notes never leave the tenant (see the catalogue above), and payloads
  never include other companies' data, API keys, or signing secrets.
