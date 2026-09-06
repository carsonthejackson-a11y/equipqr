# "Next" roadmap — engineering brief for workstream agents

Read `docs/AGENT-BRIEF.md` first (stack, conventions, RLS rules), then
`docs/NOW-ROADMAP-BRIEF.md` (what the Now roadmap already gives you — every
contract listed there still holds). This file covers the Next roadmap
(Sept 2026, `claude/feature-audit-2026-09.md` in the EquipQR Claude project)
plus two scan-page features Carson asked for on top of it, and how five
workstreams divide the codebase so they can be built in parallel and merged
without conflicts.

## The product asks, in Carson's words

1. **Tech scans → works the ticket.** "When a tech from the service company
   scans the QR code they can see the info and use it to close out the
   ticket / update status / close-out notes." (Invoices are explicitly out
   of scope for this pass.)
2. **Customer scans a unit with an open work order → sees status, not a blank
   form.** "They can see the status, notes, and have the choice to add notes /
   update info if needed. This keeps people from submitting two work orders
   for the same problem, and anyone can check up on status."

Plus the Next lane items chosen for this pass: scheduling-lite (visit
date/time, calendar, email reminders — no SMS yet), time-based preventive
maintenance reminders, scan-to-inspect checklists with photos + customer
signature, two-way messaging on a request, and scan-to-onboard (un-park
pre-printed codes + nameplate OCR via Claude vision).

## What the foundation already gives you (commit "Foundation for the Next roadmap")

**Migration `supabase/migrations/0019_next_roadmap_foundation.sql`** — read it;
it is the contract. Verified on the local harness by
`scripts/local-db/smoke-next.sql` (run it after `db.sh reset` to see every RPC
exercised as anon / technician / owner / service role). Highlights:

- `service_requests` gained: `source` (scan|staff|pm|api), `maintenance_schedule_id`,
  `inspection_id`, `scheduled_duration_minutes` (default 60), `reminder_sent_at`,
  `on_my_way_sent_at`, `last_customer_message_at`, `unread_customer_messages`,
  `signature_path`, `signed_by_name`, `signed_at`.
- `service_request_media` gained `origin` (customer|staff), `caption`, `uploaded_by`,
  `company_id` (trigger-filled). Staff may insert `origin='staff'` rows for their
  company's requests and manage storage objects under
  `service-request-media/staff/<company_id>/<request_id>/…` (photos) and
  `service-request-media/staff/<company_id>/<request_id>/signature.png`.
  Staff read them via signed URLs like the dashboard already does.
- **`resolve_qr_code(p_token)`** (same signature, anon) now returns
  `guide.open_requests: OpenRequestSummary[]` (open = new/in_progress/scheduled/on_hold,
  newest first, max 5, includes `public_token`, `contact_first_name`, `assigned_to_name`,
  `update_count`) and `guide.equipment.next_service_due_on`.
- **`add_customer_request_update(p_public_token, p_body, p_author_name, p_contact_phone,
  p_contact_email) returns json`** — anon-callable. Appends a `request_activity` row
  (`kind='message'`, `visibility='customer'`, `author_kind='customer'`, metadata
  `{author_name, contact_phone, contact_email}`), bumps `unread_customer_messages`,
  fills in missing contact details. Rejects closed requests (`P0001`), bad tokens
  (`P0002`), bodies outside 2–2000 chars (`22023`). Returns
  `CustomerRequestUpdateResult`; `company_notification_email` and `assigned_to_email`
  are non-null **only for the service role** (call it through the admin client in an
  API route, exactly like `/api/service-requests` does).
- **`checklist_templates`** (items as JSON — `ChecklistItem[]`) and **`inspections`**
  (snapshot `InspectionItem[]` with responses, `failed_count`, `signature_path`,
  `signed_by_name`, `signed_at`, `status` in_progress|completed|abandoned). Staff RLS;
  owners delete. Photos/signature go in the private `equipment-files` bucket under
  `<company_id>/inspections/<inspection_id>/…` (0013 policies already cover it).
- **`maintenance_schedules`** (time-based: `interval_days`, `lead_days`, `next_due_on`,
  `auto_create_request`, `notify_customer`, optional `checklist_template_id`). Triggers
  keep `equipment.next_service_due_on` = earliest active schedule, and resolving a
  request with `maintenance_schedule_id` rolls the schedule forward
  (`last_completed_on`, `next_due_on += interval_days`, in the company's timezone).
- **`generate_due_maintenance_requests() returns setof json`** — service-role only
  (cron). Creates one `source='pm'` request per due schedule per cycle (idempotent via
  `last_generated_for`), writes the `pm_due` equipment event + a system activity row,
  returns `GeneratedMaintenanceRequest[]` with everything needed to email the customer
  and staff.
- **`generate_company_qr_batch(p_count) returns setof qr_codes`** — owner-only,
  1–100 unclaimed `source='batch'` codes for the caller's own company (scan-to-onboard).
  Plan gate (`getPlan(...).features.batchQr`) is app-side.

**App-side contracts** (already written — use them, don't re-implement):

- `src/lib/types.ts` — `ServiceRequestSource`, extended `ServiceRequest`,
  `ServiceRequestMedia`, `EquipmentGuide` (`open_requests`, `next_service_due_on`),
  `OpenRequestSummary`, `CustomerRequestUpdateResult`, `ChecklistItemKind`,
  `ChecklistItem`, `ChecklistTemplate`, `InspectionItemResponse`, `InspectionItem`,
  `InspectionStatus`, `Inspection`, `MaintenanceSchedule`, `GeneratedMaintenanceRequest`.
- `src/app/e/[qrToken]/page.tsx` — already detects staff (`getScanningStaff()`:
  logged-in user whose `profiles.company_id` matches the unit's company) and renders
  `<StaffScanView guide qrToken staff />` from `./staff/staff-scan-view.tsx`
  (placeholder — workstream A replaces the file). `?view=customer` shows staff the
  customer page. The customer page passes `openRequests={guide.open_requests}` into
  `<ScanActions>` (workstream B renders it) and shows a "Service technician? Sign in"
  footer link (`./staff/staff-sign-in-link.tsx`, `/login?next=/e/<token>` — the login
  form already honours a safe `next`).
- `src/components/signature-pad.tsx` — `<SignaturePad onReady={(h) => …} />`;
  `h.toBlob()` → PNG Blob (white background) or null; `h.clear()`, `h.isEmpty()`.
  Used by close-out (A) and inspections (D).
- `src/lib/client-image.ts` — `downscaleToJpeg(blob, { maxEdge, quality })` and
  `blobToBase64(blob)` for every client upload / the nameplate OCR call.
- `src/lib/rate-limit.ts` — `RATE_LIMITS.customerUpdatePerIp`, `customerUpdatePerToken`,
  `nameplatePerUser` already exist. Rate limits run through the admin client
  (`enforceRateLimits`, see `/api/service-requests/route.ts`).
- `src/components/dashboard-nav-links.ts` — "Schedule" (`/dashboard/schedule`) and
  "Checklists" (`/dashboard/checklists`) links already exist; the pages don't yet.
- `src/lib/events.ts` — `visit_scheduled`, `visit_completed`, `inspection_completed`,
  `pm_due` equipment-event kinds and the `message` activity kind exist; write them.
- Existing dashboard server actions in `src/app/dashboard/requests/actions.ts`
  (`updateRequestStatus`, `updateRequestPriority`, `assignRequest`, `addRequestNote`,
  `cancelRequest`, `closeServiceRequest`) are safe to **call** from any staff surface
  (they use `getCurrentProfile()` + RLS). They `revalidatePath` dashboard routes only —
  if you call them from `/e/*`, also call `revalidatePath('/e/[qrToken]', 'page')` or
  `router.refresh()` yourself.
- Email: `src/lib/email/layout.ts` `renderEmail({ brand })`, `brandingForEmail()` and
  `notifyRequesterOfStatus()` in `src/lib/email/request-status.ts`, `sendEmail()` in
  `send.ts`. Cron pattern: `src/app/api/cron/trial-reminders/route.ts` (`CRON_SECRET`
  bearer, admin client, `runtime = "nodejs"`), schedules in `vercel.json`.
- Anthropic: `src/lib/anthropic.ts` (`DRAFTING_MODEL`, tool-use structured output
  pattern). No image input exists yet — workstream E adds the first.

**Local DB**: `scripts/local-db/db.sh start && scripts/local-db/db.sh reset`, then
`psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-next.sql`. No Supabase
project / `.env.local` here — validate with `npm run lint`, `npx tsc --noEmit`,
`npm test`, and (once, at the end) `npm run build` with the dummy env from
`.github/workflows/ci.yml` (`NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_APP_URL=http://localhost:3000`).

## Workstream ownership (edit only what you own; shared files are append-only)

| Workstream | Builds | Owns (create/edit freely) | Reserved migration # |
|---|---|---|---|
| **A. Staff scan mode + close-out** (feature 1) | Replace `staff/staff-scan-view.tsx`: unit header (photo, make/model, location, status, last serviced, next PM due, short code), **open requests** list with status/priority/assignee, per-request actions (set status, assign to me, add internal or customer-visible note, "On my way" → email customer via `notifyRequesterOfStatus` note + stamp `on_my_way_sent_at`), **Close out** flow on the phone: summary + recommendations, before/after photos (`origin='staff'`, bucket path above), optional customer signature (`SignaturePad` → `signature.png` → `signature_path/signed_by_name/signed_at`), send resolution email toggle, then `status='resolved'` (reuse `closeServiceRequest` or a sibling action that adds media/signature — must set `closed_by`, `resolved_at`, emit `request_resolved` via the 0013 trigger). Also "Log a visit" when there's no open request (creates a `source='staff'` request already resolved, or an `equipment_events` `visit_completed` row with note/photos — your call, document it), quick links: "Start inspection" → `/e/<token>/inspect` (workstream D's route; link only), "Edit equipment" → dashboard, "View customer page" → `?view=customer`. Dashboard: signature + staff photos shown on `requests/[id]` media gallery (append a small block; do not restructure). | `src/app/e/[qrToken]/staff/**`, `src/app/e/[qrToken]/staff-actions.ts`, `src/app/dashboard/requests/[id]/media-gallery.tsx`, `src/app/dashboard/requests/[id]/close-request-dialog.tsx` (add photo/signature display only), `src/lib/email/on-my-way.ts` | `0020_staff_scan_*.sql` |
| **B. Customer open-work-order view + two-way messaging** (feature 2 + Next) | In `scan-actions.tsx`, replace the sessionStorage chip with an **"Already reported"** card built from `openRequests`: status badge, "reported <relative> by <first name>", scheduled visit if any, assigned tech first name, "View status & add a note" → `/r/<public_token>`, and demote "Report a problem" to "Report a different problem" when one is open. `/r/[token]`: add a **message composer** (name — remembered in localStorage — + note, optional phone/email if the request has none) posting to new `POST /api/request-updates` (rate limits `customerUpdatePerIp/PerToken`, zod schema in `src/lib/public-request.ts`, admin client → `add_customer_request_update`, then email `company_notification_email` and `assigned_to_email` with the note + dashboard link; never trust a company id from the client). Render `message` rows with the author name from metadata on `/r/` and in the dashboard `ActivityFeed` (customer messages visually distinct). Dashboard inbox: unread-messages badge on rows (`unread_customer_messages > 0`), filter "Has customer messages"; `requests/[id]` zeroes `unread_customer_messages` on view (server action or inline update) and gets a "Reply to customer" affordance (customer-visible note = reply; keep `addRequestNote`). Staff replies already email the customer. Overview card: "N requests with unread customer messages". | `src/app/e/[qrToken]/scan-actions.tsx`, `src/app/e/[qrToken]/open-request-card.tsx`, `src/app/r/**`, `src/app/api/request-updates/**`, `src/lib/public-request.ts` (append), `src/lib/email/customer-message.ts`, `src/app/dashboard/requests/**` (except the files A and C own), `src/app/dashboard/page.tsx` (overview counts only, append) | `0021_messaging_*.sql` |
| **C. Scheduling-lite + PM reminders** | **Schedule visit** on a request: `src/app/dashboard/requests/[id]/schedule-visit-card.tsx` + `src/app/dashboard/requests/schedule-actions.ts` (set/clear `scheduled_for` + `scheduled_duration_minutes`, set status `scheduled`, emit `visit_scheduled` equipment event + customer-visible activity, `notifyRequesterOfStatus` with the date). Mount it in `requests/[id]/page.tsx` with **one import line + one JSX line** (that file is B's; keep your edit to those two lines). `/dashboard/schedule`: week view (Mon–Sun, company timezone from `companies.timezone`, `src/app/dashboard/settings/timezones.ts` exists), list of unscheduled open requests beside it, per-technician filter, `.ics` download route for a request (`src/lib/ics.ts`). Cron `/api/cron/visit-reminders` (daily, `vercel.json`): email requester for visits in the next 24–48h where `reminder_sent_at is null`, stamp it. `/dashboard/maintenance`: PM schedules list (due soon first) + create/edit/pause/delete; per-equipment "Maintenance" card on `equipment/[id]` (new file `maintenance-card.tsx`, mount with one import + one JSX line in `equipment/[id]/page.tsx`); "Mark done" creates & resolves a PM request or just rolls the schedule. Cron `/api/cron/pm-due` (daily): admin client → `generate_due_maintenance_requests()`, then for each row email the customer (if `notify_customer && customer_updates_enabled && contact_email`, branded, with `/r/<token>` link) and the company `notification_email`. Scan page (customer + staff) shows "Next service due <date>" — the value is already in `guide.equipment.next_service_due_on`; A renders it in the staff view, you may add one line in `page.tsx` next to "Last serviced". | `src/app/dashboard/schedule/**`, `src/app/dashboard/maintenance/**`, `src/app/dashboard/requests/[id]/schedule-visit-card.tsx`, `src/app/dashboard/requests/schedule-actions.ts`, `src/app/dashboard/equipment/[id]/maintenance-card.tsx`, `src/app/dashboard/equipment/maintenance-actions.ts`, `src/app/api/cron/visit-reminders/**`, `src/app/api/cron/pm-due/**`, `src/app/api/requests/[id]/ics/**`, `src/lib/ics.ts`, `src/lib/schedule.ts`, `src/lib/email/visit-reminder.ts`, `src/lib/email/pm-due.ts`, `vercel.json` | `0022_schedule_*.sql` |
| **D. Scan-to-inspect checklists** | `/dashboard/checklists`: templates list, create/edit (items editor: label, kind, required, help; reorder), per-equipment-type or any, activate/deactivate; **"Generate with AI"** (append `generateChecklistDraft()` to `src/lib/anthropic.ts` following the `draftTroubleshootingGuide` tool-use pattern: input equipment type name/description + interval hint → items). `/e/<token>/inspect` (staff-only route — reuse the same `getScanningStaff` idea: `supabase.auth.getUser()` + profile company match, else redirect to `/login?next=`): pick a template (filtered to the unit's type + "any"), run it item by item (check / pass-fail / text / number / photo with camera capture → `equipment-files/<company_id>/inspections/<id>/<uuid>.jpg`), optional note per item, summary, customer signature (`SignaturePad`), complete → `status='completed'`, `failed_count`, emit `inspection_completed` equipment event (details: template, failed items), and offer "Create a service request for the N failed items" (creates a `source='staff'` request with `inspection_id`, description listing failures). `/dashboard/inspections/[id]` read view (signed URLs for photos + signature) and a list under `/dashboard/checklists/inspections`. Equipment timeline already renders `inspection_completed`; link the event to the inspection page (append to `timeline.tsx` only the link for that kind). | `src/app/dashboard/checklists/**`, `src/app/dashboard/inspections/**`, `src/app/e/[qrToken]/inspect/**`, `src/lib/checklists.ts`, `src/lib/anthropic.ts` (append one exported function only), `src/app/dashboard/equipment/[id]/timeline.tsx` (append only) | `0023_inspect_*.sql` |
| **E. Scan-to-onboard + nameplate OCR** | Flip `FEATURES.batchQr` default to `true` (env still overrides) and update `docs/BATCH-QR.md` + the marketing/pricing copy it gates. Owner self-serve pool: `/dashboard/settings/qr-codes` (or under equipment) → "Generate N blank codes" (`generate_company_qr_batch`, plan-gated by `features.batchQr`, Pro+ — show an upsell otherwise), list unclaimed codes, "Print blank labels" using the existing label-sheet engine (`src/lib/labels/**`, `equipment/labels/**` — reuse, don't fork; a blank label prints the short code + "Scan to set up"). Unclaimed scan by staff (`page.tsx` unclaimed branch already shows `ClaimCodeCard`): add **"Add new equipment from this sticker"** → `/e/<token>/onboard`: camera capture of the nameplate → `POST /api/nameplate` (staff auth via `createClient().auth.getUser()`, rate limit `nameplatePerUser`, image → `src/lib/nameplate.ts` `extractNameplate()` using the Anthropic SDK with an `image` content block + tool-use schema `{make, model, serial_number, voltage?, year?, confidence}`) → prefilled add-equipment form (name, type select, customer select, location, make, model, serial) → server action creates the equipment (respect plan limits via `canAddEquipment`, emit `equipment_created`) and claims the code (`claim_qr_code`) in one go → redirect to the staff scan view. Also expose the same "Scan nameplate" button on the dashboard new-equipment dialog if it's a small change (optional). | `src/app/e/[qrToken]/claim-code-card.tsx`, `src/app/e/[qrToken]/onboard/**`, `src/app/e/[qrToken]/actions.ts`, `src/app/api/nameplate/**`, `src/lib/nameplate.ts`, `src/lib/features.ts`, `src/app/dashboard/settings/qr-codes/**`, `src/app/dashboard/settings/settings-subnav.tsx` (append), `docs/BATCH-QR.md`, `src/app/(marketing)/**` copy that references batch QR | `0024_onboard_*.sql` |

Shared, append-only (add lines; never reorder or reformat existing ones):
`src/lib/types.ts`, `src/lib/events.ts`, `src/lib/rate-limit.ts`,
`src/components/dashboard-nav-links.ts`, `src/app/dashboard/settings/settings-subnav.tsx`,
`package.json` (add deps only — prefer none), `.env.local.example`, `README.md`,
`src/app/e/[qrToken]/page.tsx` (A and C may each add one small block; nobody
restructures it), `src/app/dashboard/requests/[id]/page.tsx` and
`src/app/dashboard/equipment/[id]/page.tsx` (C: one import + one JSX line each).

Do NOT edit `supabase/migrations/0001` … `0019`. Only add a migration if the
foundation truly lacks something — prefer app-side solutions. If you add one, use
your reserved number and keep it additive; extend `scripts/local-db/smoke-next.sql`
(append a section) so it's exercised.

## Product guardrails

- The customer scan page must keep working with **no login, one hand, on a phone**.
  Nothing new may push "Troubleshoot" / "Report a problem" / "Call us" below the fold
  on a 375px-wide screen except an open-request card, which is the point.
- Staff surfaces on `/e/*` are for a technician **standing at the machine**: big
  targets, camera-first, one action per screen, no tables.
- `open_requests` and `public_token` are visible to anyone holding the sticker — by
  design. Never expose requester email/phone on customer-facing surfaces; first name
  only. Customer messages carry an author name the customer typed; render it as text.
- Every customer-facing email respects `customer_updates_enabled` and goes through
  `renderEmail({ brand })`.
- Technicians can do all day-to-day work above; only owners mint code batches, delete
  templates/inspections, and change settings.

## Definition of done for every workstream

1. `npm run lint`, `npx tsc --noEmit`, `npm test` all pass; add Vitest tests for any
   pure logic you write (ICS generation, week-grid math, checklist validation,
   nameplate parsing, message schema, etc.).
2. Every staff mutation appends the right `equipment_events` / `request_activity` row
   via `src/lib/events.ts`.
3. Every new table/RPC access respects RLS (staff client) or goes through a
   security-definer RPC (public). Never use the admin client outside `/api/*` routes
   that already do (rate limiting, service-role RPC calls, cron) and the Stripe webhook.
4. Mobile-first for anything under `/e/*` and `/r/*`.
5. Commit on your worktree branch with clear messages. Report: files touched,
   anything you deferred, every shared-file line you added, and anything the
   merge step must know (e.g. "mounted `<ScheduleVisitCard>` on line 101 of
   requests/[id]/page.tsx").
