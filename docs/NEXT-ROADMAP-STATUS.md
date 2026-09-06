# Next roadmap — implementation status (2026-09-06)

Branch: `feat/next-roadmap` (on top of `main` @ `c3c8a08`). Roadmap source: the "Next" phase of
`claude/feature-audit-2026-09.md` in the EquipQR Claude project; scope was reconstructed from
the hooks the Now foundation (0013) left behind and is spelled out in
`docs/NEXT-ROADMAP-BRIEF.md`.

## Verified

- `npm run lint`, `npx tsc --noEmit`, `npm test` (28 files / 337 tests), `npm run build`
  (CI dummy env), `npm run test:e2e` (6 passed, 1 skipped — the one needing a real Supabase).
- Migrations 0001–0025 apply cleanly on a throwaway local Postgres
  (`scripts/local-db/db.sh reset`). Five smoke suites run as `anon` / `authenticated` /
  `service_role`: `smoke.sql` (Now), `smoke-next.sql` (0019: PM trigger, custom-field RLS,
  customer-message RPC, webhook outbox / lease / retry bookkeeping, tenant isolation, and the
  `get_request_status` additions), `smoke-equipment.sql` (0022 scan-page fields, PM stamp,
  0024 pending flag), `smoke-webhooks.sql` (0023 retry RPC), `smoke-security.sql` (0025).
- Two independent review passes over the full diff (correctness and security); findings and
  fixes are listed under "Review findings" below.

## Not yet verified (needs a real Supabase project + Vercel preview)

Nothing has run against PostgREST / Supabase Auth / Storage. Before merging to `main`:

1. Apply 0019, 0022, 0023, 0024, 0025 to a dev project (or `supabase db push`). 0019 is the big one; 0025 is the security follow-up and must not be skipped.
2. `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must be set in every environment: the two new
   crons (`/api/cron/pm-reminders` daily, `/api/cron/webhooks` every 5 min — both in
   `vercel.json`) and the `after()`-triggered webhook flush all need the service role, and the
   customer-reply route needs it to learn the company's notification inbox.
3. Vercel Hobby plans only allow daily crons; the 5-minute webhook drain needs Pro (deliveries
   still go out via `after()` right after each event on any plan — the cron is the retry path).
4. Click through: schedule / reschedule / clear a visit (check the time on `/r/<token>` matches
   the company zone), reply from `/r/<token>` and see the unread dot + email, set a service
   interval and watch the due date compute, define a custom field and save a value (form,
   detail header, CSV export, scan page when flagged), register a webhook endpoint and "Send
   test" against a request bin, then check the delivery log and Retry.
5. Check the PostgREST filters that couldn't be exercised locally: the `custom_fields->>key`
   `.not(..., "is", null)` in the delete-strips-keys loop, the `?replied=1` inbox filter, and
   the `.eq("pm_reminder_pending", true)` cron query against a generated column.

## What shipped

**Foundation** (`0019`): see `docs/NEXT-ROADMAP-BRIEF.md`. PM interval + auto-maintained due
date (trigger), `equipment_custom_fields`, `add_request_customer_message()` + unread tracking,
`webhook_endpoints` / `webhook_deliveries` with trigger fan-out and service-role worker RPCs,
`get_request_status()` gains `company_timezone` + `can_reply`. App side: `src/lib/scheduling.ts`
(timezone-safe helpers), `src/lib/webhook-signing.ts` (catalogue + HMAC scheme + reference
verifier), `src/lib/webhooks.ts` (deliverer, `flushWebhooksSoon()` via `after()` from the event
emitters).

**Scheduling-lite** — schedule / reschedule / clear a visit from the request page (dialog with
the company's zone shown; defaults to the next weekday 09:00); status moves to `scheduled`;
customer-visible activity + `visit_scheduled` / `visit_canceled` timeline events; status email
renders the time in the company zone; inbox "Visit" column and sort; overview "Upcoming visits"
card. Picking "Scheduled" in the status select opens the dialog.

**Two-way messaging** — reply box on `/r/<token>` (client component, brand-coloured, 2000-char
cap) → `POST /api/request-messages` (rate limits `cm:ip` 20/h, `cm:tok` 30/h → zod → RPC via the
admin client → staff email inside `after()`); customer messages render as "You" bubbles; staff
get a "Customer replied" email (notification inbox + assignee); the dashboard shows customer
replies distinctly, marks them read on open, and the inbox has an unread dot and a "Customer
replied" filter. The response body never echoes anything from the RPC.

**PM reminders** — "Service every N days" on the edit form (due date becomes read-only and
computed); "Next service" line in the summary strip; list indicator + Maintenance filter
(`?pm=overdue|due_soon|scheduled|none`, applied in SQL); overview "Maintenance due" card; daily
cron appends `pm_due` events (de-duplicated), emails one digest per company (locked companies
get neither), and stamps `pm_reminder_sent_for` on every unit it processed so each due date is
reminded once and nothing lingers at the head of the batch. `0024` adds the
generated `pm_reminder_pending` flag so the cron's batch can't be crowded out by already-reminded
overdue units.

**Custom fields** — owner-managed definitions (`/dashboard/settings/custom-fields`: label,
immutable slug key, text / number / date / dropdown / yes-no, options, help text, show-on-scan-
page, reorder, max 20); inputs on the new-equipment dialog and edit form; values in
`equipment.custom_fields`; detail header shows filled values; timeline summary names changed
fields; CSV export (one column per field) and import (`cf:<key>` headers); v1 API returns them
as-is; `0022` re-creates `resolve_qr_code()` to include flagged fields on the scan page.

**Outbound webhooks** (Business) — Settings → API → Webhooks: endpoints (https only, event
subscriptions or all, one-time secret reveal, rotate, enable/disable, delete, send test with a
synchronous result), recent-deliveries log with Retry (`0023`); `/api/cron/webhooks` drains and
prunes; `X-EquipQR-Signature: t=…,v1=hmac-sha256("<t>.<body>")`, 10 s timeout, retries
1m/5m/30m/2h × 5, auto-disable after 20 consecutive failures. Full reference in `docs/API.md`
"Webhooks".

**Also in this branch** — the Now follow-up "requester received email is awaited inline" is
fixed (`/api/service-requests` now sends both emails in `after()`); `last_customer_message_at`
is exposed on v1 service-request payloads.

## Review findings (all fixed on this branch)

Two independent read-only passes over the full diff, before the push.

**Security**

- **HIGH — cross-tenant read through the webhook outbox.** The 0013 insert policies on
  `equipment_events` / `request_activity` only checked `company_id`, never that the referenced
  unit or request belonged to that company, and the 0019 fan-out triggers (security definer)
  looked the parent up without a company predicate and copied it into a `webhook_deliveries`
  payload the inserting owner could read back. A staff account holding a foreign UUID (unit ids
  are on every scan page) could read that tenant's unit or request. Fixed in `0025` at both
  layers (policies verify the parent; triggers add the predicate); `smoke-security.sql` asserts
  both.
- **MEDIUM — one stalled endpoint could monopolise the drain.** `claim_webhook_deliveries` now
  caps 25 rows per endpoint per claim; the deliverer works endpoints in parallel (5) with
  per-endpoint ordering and a wall-clock budget, and hands unattempted rows back with
  `release_webhook_deliveries()` (attempt refunded); the cron exports `maxDuration`.
- **LOW** — active-endpoint cap enforced by a DB trigger (was app-only); customer replies close
  14 days after resolution (`request_accepts_replies()`, mirrored in `can_reply`); URL check
  rejects IPv6 literals and 100.64/10; failed-response bodies are read to 4 KB, not in full;
  `webhook_endpoints.secret` is no longer selectable by staff (column grants).
- Checked clean: RPC grant matrix, tenant isolation of every new table, `/r` and `/e` payloads,
  webhook payload contents (no tokens, emails, phones, internal notes), secrets in RSC payloads,
  cron auth, CSV/email/JSX escaping, abuse caps.

**Correctness**

- PM cron could be starved by rows it never stamps (locked companies, bouncing digest inbox):
  every processed unit is now stamped whatever happened to the email, and `0024`'s generated
  `pm_reminder_pending` flag keeps already-reminded units out of the batch.
- Custom-field booleans corrupted on CSV round-trip (`Yes` → `false`): the parser now accepts
  yes/no/true/false/on/off/y/n/1/0 case-insensitively, leaves blanks absent, and rejects
  anything else.
- `revalidatePath("/dashboard/equipment/[id]")` without `"page"` was a no-op; "Send test"
  could wait on the whole backlog (now leases exactly its row via `claim_webhook_delivery()`);
  the unread marker wrote `now()` instead of the reply timestamp the page rendered; clearing a
  service interval dropped the computed due date; the maintenance list and card disagreed on
  retired units; enable / send-test / retry skipped the Business-plan gate; duplicate React
  keys on scan-page custom fields.

## Known gaps / follow-ups

- Webhook URL validation blocks private v4 ranges, CGNAT, IPv6 literals and local names but does
  not resolve DNS; deliveries run from Vercel's egress over https only (certificate-validated),
  with a 10 s timeout and no redirect following. Acceptable for a Business-plan, owner-only
  feature; add a resolve-time check if the app ever runs inside a private network.
- Custom-field delete scrubs the key from at most 500 units per call; a stale key past that is
  ignored by every reader.
- CSV import caps at 2000 rows (unchanged).
- The service-interval input is on the edit form only, not the new-equipment dialog.
- No `?due=` filter on `GET /api/v1/equipment`; the columns are returned as-is.
- No e2e coverage for `/r/<token>` or the dashboard flows (needs seeded data).
- Trial-lock scope for the new actions matches the Now decision: only `closeServiceRequest` and
  `createEquipment` check `requireActiveSubscription`; the dashboard `LockedScreen` hides the UI.
