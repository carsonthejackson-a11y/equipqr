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
