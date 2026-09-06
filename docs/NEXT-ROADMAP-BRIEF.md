# "Next" roadmap — engineering brief for workstream agents

Read `docs/AGENT-BRIEF.md` (stack, conventions, RLS rules) and
`docs/NOW-ROADMAP-BRIEF.md` (what the Now roadmap built and the app-side contracts you
must reuse) first. This file adds what the Next roadmap (Sept 2026) changes and how the
workstreams divide the codebase so they can be built in parallel and merged cleanly.

The Next roadmap turns the five hooks the Now foundation left behind into features:

| Feature | Hook from 0013 | What ships |
|---|---|---|
| Scheduling-lite | `service_requests.scheduled_for`, `companies.timezone`, event kind `visit_scheduled` | Book / reschedule / clear a visit on a request in the company's zone; customer sees it on `/r/<token>` and in email; upcoming visits on the overview |
| PM reminders | `equipment.next_service_due_on`, `pm_due` event kind | Per-unit service interval; due date auto-maintained; "due for service" list filter; daily reminder email + timeline event |
| Custom fields | `equipment.custom_fields` | Owner-defined fields (text / number / date / select / boolean) rendered on the equipment form, detail, CSV export and v1 API |
| Two-way messaging | `request_activity.visibility = 'customer'`, `kind = 'message'` | Customer reply box on `/r/<token>`; staff notified; unread indicator in the inbox; staff reply = customer-visible note |
| Outbound webhooks | append-only `equipment_events` / `request_activity` | Business-plan endpoints with HMAC-signed, retried deliveries drained by cron + `after()` |

## What the foundation already gives you (commit "Foundation for the Next roadmap")

**Migration `supabase/migrations/0019_next_roadmap_foundation.sql`** — read it; it is the
contract. Highlights:

- `equipment.service_interval_days` (1–3650, nullable) and `pm_reminder_sent_for date`.
  Trigger `equipment_compute_next_service_due` recomputes `next_service_due_on =
  coalesce(last_serviced_at::date, install_date, today) + interval` on insert and whenever
  the interval / last_serviced_at / install_date change (or the due date is null). Units
  without an interval keep a hand-set date.
- `equipment_custom_fields` — `key` (slug, immutable, the jsonb key), `label`, `field_type`
  text|number|date|select|boolean, `options` (json array for select), `help_text`,
  `show_on_scan_page`, `sort_order`. RLS: all staff read; owners write. Values live in
  `equipment.custom_fields` as `{ "<key>": value }`.
- `service_requests.last_customer_message_at`, `customer_messages_read_at`.
- `add_request_customer_message(p_public_token, p_body)` — anon-callable; trims, rejects
  empty / >2000 chars / unknown token / canceled requests; inserts `request_activity`
  (`message`, `customer`, author `customer`); stamps `last_customer_message_at`; returns
  `CustomerMessageResult` (notification inbox only to the service role, like
  `submit_service_request`).
- `get_request_status()` now also returns `company_timezone` and `can_reply`.
- `webhook_endpoints` (owner-only RLS; `url` must be https; `secret` is the HMAC key —
  never select it into a client component; `events text[]`, empty = all; `failure_count`,
  `disabled_at`, `last_delivery_*`) and `webhook_deliveries` (owner read-only outbox:
  `status` pending|delivered|failed, `attempts`, `next_attempt_at`, `response_status`,
  `last_error`, `payload`).
- Triggers on `equipment_events` and `request_activity` fan qualifying rows out to every
  subscribed active endpoint via `enqueue_webhook_event()` (service-role only). The
  event-type catalogue and its SQL mapping are in the migration header and in
  `src/lib/webhook-signing.ts` (`WEBHOOK_EVENT_TYPES`). Internal notes / email audit rows
  never leave the tenant.
- Worker RPCs (service role): `claim_webhook_deliveries(limit, company_id)` leases a batch
  with `for update skip locked`; `finish_webhook_delivery(id, status, error)` records the
  outcome, schedules retries (1m → 5m → 30m → 2h, 5 attempts) and disables an endpoint
  after 20 consecutive failures; `prune_webhook_deliveries()` drops rows >30 days old.
  Owners call `enqueue_webhook_test(endpoint_id)` for "Send test".

**App-side contracts** (already written — use them, don't re-implement):

- `src/lib/types.ts` — `Equipment` (+`service_interval_days`, `pm_reminder_sent_for`),
  `ServiceRequest` (+`last_customer_message_at`, `customer_messages_read_at`),
  `PublicRequestStatus` (+`company_timezone`, `can_reply`), `EquipmentCustomField`,
  `CustomFieldType`, `CustomerMessageResult`, `WebhookEndpoint`, `WebhookEndpointPublic`,
  `WebhookDelivery`, `WebhookPayload`.
- `src/lib/scheduling.ts` — `zonedDateTimeToIso(date, time, tz)`, `isoToZonedInputs`,
  `formatZonedDateTime(iso, tz)`, `formatZonedDate`, `isPastVisit`, `isValidTimeZone`.
  Every display of `scheduled_for` goes through these with `company.timezone` — the app
  renders on UTC servers.
- `src/lib/webhook-signing.ts` — event catalogue + labels, `buildSignatureHeader`,
  `verifyWebhookSignature` (reference receiver), `webhookUrlError`, constants.
- `src/lib/webhooks.ts` — `drainWebhookDeliveries(admin, { limit, companyId })`,
  `attemptDelivery`, `generateWebhookSecret`, `flushWebhooksSoon(companyId)`.
  `emitEquipmentEvent()` / `emitRequestActivity()` already call `flushWebhooksSoon()`.
- `vercel.json` already schedules `/api/cron/pm-reminders` (daily 13:00 UTC) and
  `/api/cron/webhooks` (every 5 min). Both routes must check `CRON_SECRET` exactly like
  `src/app/api/cron/trial-reminders/route.ts`.

**Local DB**: `DBNAME=equipqr_<yourletter> scripts/local-db/db.sh reset` gives you your own
throwaway database (the shared default one is in use by other workstreams — never reset it).
`scripts/local-db/smoke.sql` then `scripts/local-db/smoke-next.sql` exercise every RPC as
`anon` / `authenticated` / `service_role`:
`psql "$(DBNAME=equipqr_x scripts/local-db/db.sh url)" -f scripts/local-db/smoke.sql`.
There is NO Supabase project and no `.env.local` — validate with `npm run lint`,
`npx tsc --noEmit`, `npx vitest run <your test files>`. Do NOT run `npm run build` or
`npm test` (the full suite) while other workstreams are editing — the integrator runs both once at the end.

## Workstream ownership (edit only what you own; shared files are append-only)

| Workstream | Owns (create/edit freely) | Reserved migration # |
|---|---|---|
| R. Requests: scheduling-lite + inbox side of messaging | `src/app/dashboard/requests/**`, `src/app/dashboard/upcoming-visits-card.tsx` (new, self-contained server component; the integrator mounts it on the overview), `src/lib/email/request-status.ts`, `src/lib/email/visit-scheduled.ts` (new) | `0020_requests_*.sql` |
| P. Public messaging | `src/app/r/**`, `src/app/api/request-messages/**` (new), `src/lib/email/customer-message.ts` (new), `src/lib/customer-message.ts` (+ test, zod schema), `src/lib/rate-limit.ts` (append a rule), `src/components/public/**` | `0021_messaging_*.sql` |
| Q. Equipment: PM reminders + custom fields | `src/app/dashboard/equipment/**`, `src/app/dashboard/settings/custom-fields/**` (new), `src/app/dashboard/maintenance-due-card.tsx` (new, self-contained; integrator mounts it), `src/lib/equipment.ts`, `src/lib/custom-fields.ts` (new + test), `src/lib/pm-reminders.ts` (new + test), `src/app/api/cron/pm-reminders/**`, `src/lib/email/pm-reminder.ts`, `src/app/api/export/[entity]/route.ts`, `src/app/api/v1/equipment/**`, `src/app/e/[qrToken]/page.tsx` (custom fields with `show_on_scan_page`, if you add the RPC change) | `0022_equipment_*.sql` |
| W. Webhooks | `src/app/dashboard/settings/api/**` (add a Webhooks section; keep the API-keys section intact), `src/app/dashboard/settings/webhooks/**` if you prefer a page, `src/app/api/cron/webhooks/**`, `src/lib/webhooks.ts` (extend, don't break the exported names), `docs/API.md` (add a "Webhooks" section) | `0023_webhooks_*.sql` |

Shared, append-only (add lines; never reorder or reformat existing ones):
`src/lib/types.ts`, `src/lib/events.ts`, `src/components/dashboard-nav-links.ts`,
`src/app/dashboard/settings/settings-subnav.tsx`, `src/components/status-badge.tsx`,
`package.json` (add deps only — prefer none), `.env.local.example`, `README.md` (one bullet
per feature in the relevant section).

Do NOT edit `supabase/migrations/0001` … `0019`. Only add a migration if the foundation
truly lacks something — prefer app-side solutions. If you add one, use your reserved number,
keep it additive, and make sure `scripts/local-db/db.sh reset` still applies cleanly and the
smoke suites still pass. Do NOT edit `src/app/dashboard/page.tsx` (the overview) — build a
card component in your own file and the integrator mounts it.

## Definition of done for every workstream

1. `npm run lint`, `npx tsc --noEmit`, `npx vitest run <your files>` all pass; add Vitest
   tests for any pure logic you write.
2. Every staff mutation appends the right `equipment_events` / `request_activity` row via
   `src/lib/events.ts` (that is also what feeds webhooks).
3. Every new table/RPC access respects RLS (staff client) or goes through a security-definer
   RPC (public). Never use the admin client outside `/api/v1/*`, `/api/cron/*`, the Stripe
   webhook, the rate limiter, and the webhook deliverer.
4. Technicians can do day-to-day work; only owners change settings / definitions / endpoints.
5. Customer-facing surfaces (`/r`, `/e`, emails) go through `resolveBranding()` and never
   expose ids, internal notes, or other requests.
6. Do NOT commit. Report: files touched, anything you deferred, and any shared-file line
   you added.
