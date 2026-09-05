# "Now" roadmap — engineering brief for workstream agents

Read `docs/AGENT-BRIEF.md` first (stack, conventions, RLS rules). This file adds
what the Now roadmap (Sept 2026) changed and how the five workstreams divide
the codebase so they can be built in parallel and merged without conflicts.

## What the foundation already gives you (commit "Foundation for the Now roadmap")

**Migration `supabase/migrations/0013_now_roadmap_foundation.sql`** — read it; it is
the contract. Highlights:

- `companies`: `logo_path`, `brand_color` (#rrggbb), `phone`, `sms_number`, `website`,
  `timezone`, `customer_updates_enabled`. Storage buckets: `company-assets` (PUBLIC —
  logos, equipment photos; object names must start with `<company_id>/`) and
  `equipment-files` (PRIVATE — documents; same naming rule; staff read via signed URLs).
- `api_keys` (owner-only RLS) + `resolve_api_key(p_key_hash)` (service_role only).
- `qr_codes`: `short_code` (8 chars, unambiguous alphabet, stored without dash),
  `status` active|retired|replaced, `replaced_by_id`, `retired_at`, `label_printed_at`.
  Uniqueness is now "one ACTIVE code per equipment". New instant codes use the short
  code as the URL token (`/e/ABCD2345`); legacy 24-hex and batch tokens still resolve.
  RPCs: `retire_qr_code(id)`, `replace_qr_code(id) returns qr_codes`,
  `reassign_qr_code(id, equipment_id)`, `get_equipment_scan_stats(equipment_id)`.
  `resolve_qr_code(p_token)` accepts token OR short code (any case, with/without dash)
  and now returns `status: 'retired'` for retired codes, plus company branding/contact,
  equipment v2 fields and `code: { short_code, status }` in the guide.
- `equipment`: `make`, `model`, `install_date`, `warranty_ends_on`, `status`
  (active|needs_service|out_of_service|retired), `notes`, `photo_path`,
  `last_serviced_at` (auto-stamped by trigger when a request resolves),
  `next_service_due_on` (reserved for PM reminders), `custom_fields jsonb`, `updated_at`.
- `equipment_documents` (private files per unit) and `equipment_events` (append-only
  timeline; kinds in `src/lib/events.ts`; staff can insert, never update/delete).
- `service_requests`: `priority` low|normal|high|urgent, `assigned_to` (profiles.id),
  `assigned_at`, `customer_id`, `public_token` (for `/r/<token>`), `status_updated_at`
  (trigger-maintained), `scheduled_for` (reserved for scheduling-lite), `closed_by`,
  `updated_at`. Enum `request_status` gained `scheduled`, `on_hold`, `canceled`.
- `request_activity`: notes/messages/audit rows per request. `visibility` internal|customer
  — customer rows show on the public status page. Authors may edit/delete their own
  `note` rows only.
- `rate_limits` + `check_rate_limit(key, limit, window_seconds)` (anon-callable).
- `submit_service_request(...)` gained `p_priority` and returns `public_token`,
  `company_id`, `company_phone`, `company_logo_path`, `company_brand_color`,
  `customer_updates_enabled`; it also writes the timeline + activity rows.
- `get_request_status(p_public_token)` — anon-callable, returns `PublicRequestStatus`.
- `record_scan(p_qr_token, p_user_agent, p_source)`.

**App-side contracts** (already written — use them, don't re-implement):

- `src/lib/types.ts` — all new row types (`ApiKey`, `EquipmentDocument`, `EquipmentEvent`,
  `RequestActivity`, `PublicRequestStatus`, `EquipmentScanStats`, extended `Company`,
  `Equipment`, `QrCode`, `ServiceRequest`, `EquipmentGuide`, `ResolvedQrCode`).
- `src/lib/events.ts` — `emitEquipmentEvent()`, `emitRequestActivity()`, kind labels.
  Every staff action that changes a unit or request appends a row through these.
- `src/lib/qr.ts` — `generateShortCode`, `normalizeShortCode`, `formatShortCode`
  ("ABCD-2345"), `getEquipmentPublicUrl`, `getRequestStatusUrl`, `generateQrDataUrl` /
  `generateQrSvg` / `generateQrPngBuffer` (all EC level H, 4-module quiet zone).
- `src/lib/rate-limit.ts` — `RATE_LIMITS`, `getClientIp`, `checkRateLimit`,
  `enforceRateLimits([...])` → ready 429 response.
- `src/lib/branding.ts` — `resolveBranding({ company, planId, supabaseUrl })` applies the
  plan gate (Starter never gets logo/colour; contact buttons always show), `phoneHref`.
- `src/lib/api-auth.ts` — `authenticateApiRequest(request, scope)` for `/api/v1/*`,
  `generateApiKey()`, `hashApiKey()`.
- `src/lib/email/layout.ts` — `renderEmail({ brand })` for company-branded customer emails.
- `src/lib/email/request-status.ts` — `notifyRequesterOfStatus(supabase, {...})` (one call,
  respects `customer_updates_enabled`, records an `email_sent` activity row),
  `buildRequestReceivedEmail`, `brandingForEmail`.
- `src/components/status-badge.tsx` — `StatusBadge`, `PriorityBadge`, `EquipmentStatusBadge`
  and the `*_LABELS` / `OPEN_REQUEST_STATUSES` constants. Never re-declare status lists.
- `src/app/dashboard/equipment/[id]/qr-section.tsx` — self-contained server component for
  the QR side of the equipment page.

**Local DB**: `scripts/local-db/db.sh start && scripts/local-db/db.sh reset` gives you a
throwaway Postgres with all migrations applied (`DATABASE_URL=postgresql://postgres@localhost:54329/equipqr`).
`scripts/local-db/smoke.sql` shows how to exercise RPCs as `anon` / `authenticated`.
There is NO Supabase project wired up in this environment and no `.env.local` — you cannot
run the app against a real backend. Validate with `npm run lint`, `npx tsc --noEmit`,
`npm test`, and (once) `npm run build` with the dummy env from `.github/workflows/ci.yml`.

## Workstream ownership (edit only what you own; shared files are append-only)

| Workstream | Owns (create/edit freely) | Reserved migration # |
|---|---|---|
| A. QR hardening & labels | `src/app/dashboard/equipment/[id]/{qr-section,qr-card,assign-code-form}.tsx`, `src/app/dashboard/equipment/[id]/label/**`, `src/app/dashboard/equipment/[id]/qr/**` (download routes), `src/app/dashboard/equipment/labels/**` (sheet builder), `src/lib/labels/**`, `src/lib/qr.ts` | `0014_qr_*.sql` |
| B. Scan page v2 + status page + rate limiting | `src/app/e/**`, `src/app/r/**`, `src/app/api/service-requests/**`, `src/app/api/guide-chat/**`, `src/lib/rate-limit.ts`, `src/lib/branding.ts`, `src/lib/email/request-status.ts`, `src/components/public/**` | `0015_scan_*.sql` |
| C. Equipment record v2 | `src/app/dashboard/equipment/page.tsx`, `src/app/dashboard/equipment/[id]/page.tsx`, `src/app/dashboard/equipment/[id]/{edit-equipment-form,timeline,documents,photo}*.tsx`, `src/app/dashboard/equipment/actions.ts`, `src/app/dashboard/equipment/import/**`, `src/app/dashboard/equipment/new-equipment-dialog.tsx`, `src/lib/csv.ts`, `src/lib/events.ts` | `0016_equipment_*.sql` |
| D. Request workflow v2 | `src/app/dashboard/requests/**`, `src/components/status-badge.tsx`, `src/app/dashboard/page.tsx` (overview counts only) | `0017_requests_*.sql` |
| E. Branding settings, export, API keys, v1 API | `src/app/dashboard/settings/**` (except `team/`, `billing/`, `account/`), `src/app/api/v1/**`, `src/app/api/export/**`, `src/lib/api-auth.ts`, `docs/API.md` | `0018_api_*.sql` |

Shared, append-only (add lines; never reorder or reformat existing ones — this is what
keeps merges clean): `src/lib/types.ts`, `src/components/dashboard-nav-links.ts`,
`src/app/dashboard/settings/settings-subnav.tsx`, `package.json` (add deps only),
`.env.local.example`, `README.md` (add a bullet in the relevant section).

Do NOT edit `supabase/migrations/0001` … `0013`. Only add a migration if the foundation
truly lacks something — prefer app-side solutions. If you add one, use your reserved
number and keep it additive.

## Definition of done for every workstream

1. `npm run lint`, `npx tsc --noEmit`, `npm test` all pass; add Vitest tests for any pure
   logic you write (CSV parsing, label layout math, scope checks, etc.).
2. Every staff mutation appends the right `equipment_events` / `request_activity` row via
   `src/lib/events.ts`.
3. Every new table/RPC access respects RLS (staff client) or goes through a security-definer
   RPC (public). Never use the admin client outside `/api/v1/*` and the Stripe webhook.
4. Technicians can do day-to-day work; only owners change settings/billing/keys/deletes.
5. Commit on your worktree branch with clear messages. Report: files touched, anything you
   deferred, and any shared-file line you added.
