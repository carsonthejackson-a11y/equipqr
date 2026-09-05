# Now roadmap — implementation status (2026-09-05)

Branch: `feat/now-roadmap` (19 commits on top of `main` @ `de5303a`; 129 files, +15.5k / −0.8k).
Roadmap source: `claude/feature-audit-2026-09.md` in the EquipQR Claude project.

## Verified

- `npm run lint`, `npx tsc --noEmit`, `npm test` (238 tests / 19 files), `npm run build`
  (CI dummy env), `npm run test:e2e` (6 passed, 1 skipped — the one needing a real Supabase).
- Migrations 0001–0018 apply cleanly on a throwaway local Postgres
  (`scripts/local-db/db.sh reset`); `scripts/local-db/smoke.sql` asserts the public RPCs,
  triggers, lifecycle RPCs, rate limiter grants, and cross-tenant isolation (two companies).
- One independent security review pass (findings fixed: cross-tenant instant-code attach,
  assignee validation, anon notification-email leak — pre-existing since 0001 — rate-limit
  counter poisoning, CSV formula injection, `key_hash` in the RSC payload).

## Not yet verified (needs a real Supabase project + Vercel preview)

Nothing has run against PostgREST / Supabase Auth / Storage. Before merging to `main`:
1. Apply 0013, 0015, 0017, 0018 to a dev project (or `supabase db push`).
2. Set `SUPABASE_SERVICE_ROLE_KEY` in every environment — it now gates staff new-request
   notifications, rate limiting, `/api/v1/*` (and the Stripe webhook, as before).
3. Click through: scan page (`/e/<short code>`), request submit + `/r/<token>`, equipment
   detail (photo, documents, timeline), label sheet PDF, request inbox filters, branding
   preview, API key create + `curl /api/v1/me`.
4. Check the `.or()` search filters in the inbox and find-code route against live PostgREST.

## What shipped, per workstream

**Foundation** (`0013`): see `docs/NOW-ROADMAP-BRIEF.md` — schema for every Now feature plus
hooks for Next: `service_requests.scheduled_for`, `equipment.next_service_due_on`,
`equipment.custom_fields`, `request_activity.visibility='customer'` (two-way messaging),
`equipment_events` (append-only timeline webhooks can tail), `companies.timezone`.

**A. QR hardening & labels** — EC-H everywhere; 8-char short codes are the URL token for new
codes and printed on every label (`ABCD-2345`); legacy tokens keep resolving; PNG/SVG download
routes; single label with size presets; Avery 5160/5163/22806 PDF sheets (`pdf-lib`,
`src/lib/labels/**`); replace / retire / move-code RPCs + UI; previous-code history; per-unit
scan stats; staff "enter a code" lookup. Docs: `docs/QR-LABELS.md`.

**B. Scan page v2 + status page + rate limiting** — branded, mobile-first landing with photo,
make/model, location, four actions (Troubleshoot / Report / Call / Text), out-of-service
notice, last-serviced; camera-first uploads with client downscale; priority hint; confirmation
with `/r/<token>` tracking link; requester "received" + status-update emails (branded, gated by
`customer_updates_enabled`); rate limits on `/api/service-requests`, `/api/guide-chat`,
`/r/*`; `0015` fixes the `ai_summary` write that RLS silently blocked.

**C. Equipment record v2** — make/model/install/warranty/status/notes; photo (public bucket);
documents (private bucket, signed URLs); service-history timeline with add-note / log-service;
list search + filters + pagination + warranty-soon indicator; owner-only CSV import with
preview, plan-limit check, and instant codes (`src/lib/csv.ts`, `src/lib/qr-codes.ts`).

**D. Request workflow v2** — six statuses, priority, assignment, internal + customer-visible
notes, cancel with reason, activity feed, inbox filters/search/pagination, overview "needs
attention" card, customer page shows open requests. `0017` adds `priority_rank` for sorting.

**E. Branding, export, API** — company contact/timezone settings; Branding page (logo, colour,
live preview; Pro+); API keys page (Business); CSV export of equipment/customers/requests/
scans; `/api/v1/*` read + PATCH with key auth, cursor pagination, per-key rate limit.
Docs: `docs/API.md`.

## Known gaps / follow-ups

- Trial-lock (`requireActiveSubscription`) is only enforced on `closeServiceRequest` and
  `createEquipment`, matching pre-roadmap behaviour; the dashboard `LockedScreen` hides the UI
  anyway. Decide whether status/assign/QR actions should be gated too.
- Assignment emails reuse the status-update template (subject reflects the unchanged status).
- Label sheet `startOffset` (partially used sheets) is implemented but has no UI.
- CSV import caps at 2000 rows per file.
- Requester "received" email is awaited inline in `/api/service-requests`; move to `after()`.
- No `/r/<token>` e2e test (needs seeded data).
- `resolveBranding` fails open to "entitled" when the plan can't be read (by design; note it).
