# Next roadmap — implementation status (2026-09-06)

Branch: `feat/next-roadmap` on top of `main` @ `c3c8a08`. 97 files, +11.6k / −0.3k.
Roadmap source: `claude/feature-audit-2026-09.md` in the EquipQR Claude project;
engineering contract: `docs/NEXT-ROADMAP-BRIEF.md`.

## Verified

- `npm run lint`, `npx tsc --noEmit`, `npm test` (25 files / 341 tests), `npm run build`
  (CI dummy env), `npm run test:e2e` (6 passed, 1 skipped — needs a real Supabase).
- Migrations 0001–0021 apply cleanly on the local harness (`scripts/local-db/db.sh reset`);
  `scripts/local-db/smoke-next.sql` exercises every new RPC/policy as anon, technician,
  owner and service role, including cross-tenant negative cases.
- One independent security review pass (opus). Fixed before merge: staff media rows
  could name any storage object (cross-tenant signed-URL read); `maintenance_schedules`,
  `inspections` and staff-inserted `service_requests` could reference another tenant's
  `equipment_id`; `onboardEquipment` / `createEquipment` / `updateEquipment` accepted
  foreign `equipment_type_id` / `customer_id` (would publish that type's guide via
  `resolve_qr_code`); `.ics` CR injection; null `full_name` crash in staff scan mode;
  per-request rate ceiling inside `add_customer_request_update` (anon-callable RPC).
- **Migrations 0019, 0020, 0021 are applied to the production Supabase project**
  (`kjcskyzcddkxsqqyyspa`). Supabase security advisor shows only the pre-existing
  "security definer callable by anon" notices for intentionally public RPCs.

## Not yet verified (needs a Vercel preview)

1. Set `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY` in every
   environment — they gate customer-message staff emails, both new crons, and nameplate OCR.
2. Click through on a phone: scan as customer with an open request (`/e/<code>`),
   `/r/<token>` message composer, sign in and scan as a technician (staff view, close-out
   with photos + signature, "On my way"), `/e/<code>/inspect`, an unclaimed blank code →
   `/e/<code>/onboard` with a nameplate photo, `/dashboard/schedule`, `/dashboard/maintenance`,
   `/dashboard/checklists`, `/dashboard/settings/qr-codes`.
3. Storage: live `storage.objects` policy for `service-request-media/staff/<company>/…`
   (the local harness has no Storage schema).
4. Trigger both crons once by hand: `curl -H "Authorization: Bearer $CRON_SECRET"
   https://equipqr.co/api/cron/pm-due` and `.../visit-reminders`.

## What shipped, per workstream

**Foundation** (`0019`, `docs/NEXT-ROADMAP-BRIEF.md`): `service_requests.source` /
scheduling / messaging / close-out columns; staff media + signature; `resolve_qr_code`
returns `open_requests` + `next_service_due_on`; `add_customer_request_update()`;
`checklist_templates`, `inspections`, `maintenance_schedules` + triggers;
`generate_due_maintenance_requests()`; `generate_company_qr_batch()`; staff detection on
the scan page; `SignaturePad`; `client-image.ts`; rate-limit rules; nav links.

**A. Staff scan mode + close-out** (Carson's feature 1) — a logged-in technician who
scans lands on `staff/staff-scan-view.tsx`: unit header (photo, make/model, location,
status, last serviced, next PM due, short code), open requests with quick status /
assign-to-me / note, "On my way" (emails the requester with an ETA, stamps
`on_my_way_sent_at`), full **close-out on the phone** (summary, recommendations,
before/after photos, customer signature, resolution email), "Log a visit" when nothing is
open, links to inspect / edit / customer preview. Dashboard media gallery shows technician
photos and the signature. Not signed in? The customer page has a "Service technician?
Sign in" link that returns to the sticker.

**B. Customer open-work-order view + two-way messaging** (Carson's feature 2 + Next) —
scanning a unit with an open request shows an "Already reported" card (status, who,
when, scheduled visit, assigned tech, update count) with "View status & add a note";
"Report a problem" becomes "Report a different problem". `/r/<token>` gained a message
composer (name remembered on the phone; closed requests say so instead); messages appear
on the status page and in the dashboard feed, staff get an email per message, the inbox
shows unread badges + a "Has customer messages" filter, the request page zeroes the
counter and has "Reply to customer". `0021` adds `author_name` to `get_request_status`.

**C. Scheduling-lite + PM reminders** — schedule-visit card on every request (company
timezone, duration, `.ics` download, customer email), `/dashboard/schedule` week view
with technician filter and unscheduled list, cron `visit-reminders` (daily, 36h window).
`/dashboard/maintenance` + per-unit maintenance card: interval/lead-days schedules, "Mark
done" rolls forward, cron `pm-due` creates PM requests and emails customer + staff. Scan
page shows "Next service due".

**D. Scan-to-inspect checklists** — `/dashboard/checklists` templates (items editor,
per-type or any, "Generate with AI"), `/e/<code>/inspect` staff-only run (check /
pass-fail / text / number / photo, notes, autosave, signature), completion writes
`inspection_completed` to the unit timeline and can create a follow-up request for failed
items; `/dashboard/inspections/<id>` read view. `0020` lets staff insert `source in
('staff','pm')` requests against their own equipment.

**E. Scan-to-onboard + nameplate OCR** — `FEATURES.batchQr` defaults on; owners mint
blank codes at `/dashboard/settings/qr-codes` (Pro+, prints blank labels via the existing
sheet engine); scanning an unclaimed code as staff offers "Add new equipment from this
sticker" → photograph the nameplate → Claude vision fills make/model/serial → create +
claim in one step; "Scan nameplate" button on the dashboard new-equipment dialog too.
Marketing copy for pre-printed stickers restored; `docs/BATCH-QR.md` rewritten.

## Ported additions (2026-09-07): custom fields + outbound webhooks

Two Next-lane features built on a parallel branch (`claude/feature-roadmap-next-push-bpik4m`,
tag `next-alt-impl`) were ported onto this branch as one additive migration,
`0022_webhooks_and_custom_fields.sql`, plus app code. The parallel branch's own scheduling,
messaging and PM-interval work was dropped in favour of what is already here.

- **Custom fields** — owner-managed definitions under `/dashboard/settings/custom-fields`
  (label, immutable slug key, text / number / date / dropdown / yes-no, options, help text,
  show-on-scan-page, reorder, max 20); inputs on the new-equipment dialog and edit form;
  values in `equipment.custom_fields`; detail header shows filled values; timeline summary
  names changed fields; equipment CSV export (one column per field) and import (`cf:<key>`
  headers); v1 API returns `custom_fields` as stored; `resolve_qr_code()` gains
  `equipment.custom_fields` for flagged fields, rendered on the scan page.
- **Outbound webhooks** (Business) — Settings → API → Webhooks: endpoints (https only,
  event subscriptions or all, one-time secret reveal, rotate, enable/disable, delete, send
  test with a synchronous result), recent-deliveries log with Retry; triggers on
  `equipment_events` / `request_activity` fill a `webhook_deliveries` outbox; the deliverer
  (`src/lib/webhooks.ts`) runs from `after()` in the event emitters and from
  `/api/cron/webhooks` every 5 minutes; `X-EquipQR-Signature: t=…,v1=hmac-sha256("<t>.<body>")`,
  10 s timeout, retries 1m/5m/30m/2h × 5, auto-disable after 20 consecutive failures,
  per-endpoint claim cap, time-budgeted parallel drain with hand-back. Reference in
  `docs/API.md` "Webhooks".
- **Hardening carried over from that branch's security review** — the 0013 insert policies
  on `equipment_events` / `request_activity` now verify the referenced unit / request belongs
  to the caller's company (previously only `company_id` was checked, which the new
  security-definer fan-out triggers would have turned into a cross-tenant read); the
  triggers add the company predicate as well; the endpoint cap is DB-enforced;
  `webhook_endpoints.secret` is not selectable by staff (column grants); webhook URLs reject
  private v4 ranges, CGNAT, IPv6 literals and local names.

Verified here: `npm run lint`, `npx tsc --noEmit`, `npm test` (28 files / 382 tests),
`npm run build`, `npm run test:e2e`; migrations 0001–0022 on a fresh local Postgres with
`smoke.sql` + `scripts/local-db/smoke-port.sql` (custom fields, scan-page exposure, outbox
fan-out and visibility, leasing / retry / disable bookkeeping, the tightened insert policies,
tenant isolation) and, on a separate reset, this branch's own `smoke-next.sql`.

Not yet verified: 0022 against the production project (0019–0021 are already applied there;
0022 is additive and next in sequence). Set `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` for
the webhook cron; Vercel Hobby only allows daily crons, so the 5-minute drain needs Pro
(deliveries still go out via `after()` right after each event on any plan).

## Known gaps / follow-ups

- Invoices at close-out were explicitly skipped this pass.
- SMS ("on my way" / reminders) is email-only until Twilio exists.
- `unread_customer_messages` is zeroed while rendering the request page; a `<Link>`
  prefetch could in theory clear it — fine for now, revisit if it confuses anyone.
- Anyone holding a sticker can add a note to that unit's open request and, if the request
  has no email yet, subscribe an address to its updates. Deliberate (matches the product
  ask) but worth stating in the privacy copy.
- Inspection photo tiles during a run show a placeholder label rather than a thumbnail;
  the read view shows real images.
- Both crons are N+1 per row and `visit-reminders` relies on PostgREST's default row cap.
- Pre-existing: the "Migrations check" workflow only guards edits to files on `main`;
  0019–0021 are already applied to production, so from here they are frozen too.
