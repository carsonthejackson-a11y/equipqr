# QoL & continuity pass — engineering brief (2026-09-16)

Branch `feat/qol-continuity` (foundation commit `40ee7a5`). Workstreams run in parallel git worktrees on
`ws/qol-*` branches and are merged back in order. Source audit (not in the repo): inventories, research, the
continuity critique (**C1-nn**) and the UX/QoL critique (**Q-nn**) produced on 2026-09-16. Each item below cites
those ids so reviewers can trace why it exists.

Direction from Carson: service shops (solo / 1–3 techs) are the primary buyer; restaurants are the feeder. The
90-day goal is a polished public launch and the first outside paying shops. This pass ships **clear wins only**:
no product decisions, **no migrations**, no new runtime dependencies.

## 1. Rules for every workstream

1. **No database migrations, no production access, no pushes, no new npm dependencies.** If an item turns out to
   need a migration, stop, leave it out and say so in your report.
2. **Use the foundation helpers** instead of re-deriving things:
   - Times people read: `formatCompanyDateTime / formatCompanyDate / formatCompanyTime / formatCompanyLongDateTime`
     (`src/lib/format.ts`) with the company's IANA zone; `companyFormatters(timeZone)`
     (`src/lib/company-formatters.ts`, client-safe); never bare `toLocale*String()` in code you touch.
   - Server pages/actions: `getCompanyContext()` (`src/lib/company-context.ts`) for profile, company, role, kind,
     vocab, fmt, entitlements, plan, isLocked.
   - Customer-facing email: `sendCompanyEmail()` (`src/lib/email/company-email.ts`) → From "{Company} via EquipQR",
     Reply-To the company's notification email. It returns `{ sent, to }`.
   - Inbox/overview buckets: `REQUEST_BUCKETS` + appliers (`src/lib/request-queries.ts`). Inbox links use
     `/dashboard/requests?bucket=<key>` (keys: `open`, `unassigned`, `urgent`, `unreadMessages`, `awaitingVendor`).
   - Contact links: `telHref`, `smsHref(phone, body)`, `mapsHref(address)` (`src/lib/contact-links.ts`).
3. **Vocabulary:** any user-visible noun you add or touch for requests, counterparties, sites, reporters or assignees
   comes from `vocabFor(kind)` / `ctx.vocab`. Screens both kinds can reach must read naturally for both.
4. **Honesty:** UI copy may only claim what actually happened ("Customer notified" only when an email was sent).
   Marketing and in-app claims must match code. Never invent statistics, customers or testimonials.
5. **Field ergonomics:** public and staff scan pages are the best surfaces in the app — keep their 44–56px targets,
   camera-first uploads and tone. New mobile UI: ≥44px targets, primary action reachable by thumb, no sideways
   scrolling at 390px.
6. **Accessibility:** visible labels or `aria-label` on every control you add, icon-only buttons get `aria-label`,
   keep focus rings, text contrast ≥ 4.5:1.
7. **Next.js 16 is customized** — read `node_modules/next/dist/docs/` before using routing, `after()`, loading/
   not-found conventions or server actions. `src/proxy.ts` replaces middleware.
8. **Tests:** add unit tests for new pure logic; fix tests your change breaks. Run only targeted checks:
   `npx vitest run <files>`, `npx eslint <changed files>`, and `npx tsc --noEmit` at most twice (the build machine
   has 2 CPUs — before tsc, if `pgrep -fc "tsc --noEmit"` ≥ 2, wait a minute). No `next build`, no full suite, no
   `npm install`.
9. **Commits:** small logical commits on your `ws/qol-*` branch, subject prefixed with your workstream id (e.g.
   `QoL-3: …`), body ending with the two attribution lines used on this branch.
10. **File ownership:** edit the files your workstream owns (§3). If you must touch another workstream's file, keep
    the hunk minimal and list it in your report so the merge can be checked.

## 2. Shared defaults (decided, apply consistently)

- **"On my way" with no email on file:** offer a text from the tech's own phone: `smsHref(phone, "Hi {first name},
  this is {tech first name} from {company} — I'm on my way.")` plus Call. Never claim a send that didn't happen.
  Tapping "On my way" also assigns an unassigned request to the tech and moves `new`/`scheduled` to `in_progress`.
- **Warranty badges:** lists show a badge only for "In warranty" (neutral/green) and "Warranty ends in ≤ 60 days"
  (amber). Expired warranties get no list badge; detail pages say "Warranty ended {date}" in neutral text.
- **Equipment delete copy (true semantics, C1-32):** deleting a unit permanently deletes its service requests,
  activity, documents and signatures; its sticker is *not* destroyed — it becomes an unclaimed code that can be
  attached to another unit. Offer "Mark retired instead" as the primary action.
- **Navigation order (provider):** Overview · Today · Requests · Schedule · Equipment · Customers · Checklists — then
  setup: Equipment Types · Team · Billing · Settings. Owner kind keeps its current set (no Today). Requests shows a
  badge = open requests with status `new` or unread customer messages.
- **Trial copy:** providers — when a trial ends without a plan, the dashboard pauses; stickers, the customer scan
  page and incoming requests keep working and data is kept. Owners — the 14-day Kitchen trial ends and the account
  stays on Free (1 location, 10 units); owner accounts never lock.
- **Timezone labels:** emails and any time a reader could see from another zone include the zone ("10:00 AM CDT").

## 3. Workstreams

### QoL-1 — Notifications & honest messaging
Owns: `src/lib/email/**`, `src/lib/anthropic.ts`, `src/app/api/{service-requests,owner-requests,request-updates}/**`,
`src/app/api/cron/{trial-reminders,pm-due,visit-reminders}/**`, `src/app/dashboard/requests/schedule-actions.ts`, the
email-sending hunks in `src/app/dashboard/requests/actions.ts` and `src/app/e/[qrToken]/staff-actions.ts`, the
welcome-email trigger, `docs/EMAILS.md`.
1. Visit-scheduled email and every other email that shows a time use the company zone with a zone label (C1-23,
   Q-01). Builder tests pass under a non-Chicago process TZ.
2. All customer-facing emails go through `sendCompanyEmail` (C1-43). Internal "new request" email to the shop sets
   Reply-To to the requester's email when present.
3. Resolution email is company-branded like the other customer emails (C1-45).
4. Trial-ending email per kind with the §2 copy; welcome email per kind; owner PM and status emails use vocab
   (C1-34, C1-05).
5. Technicians are told: email the assignee on assignment (not when self-assigning), on schedule/reschedule, and in
   the visit-reminder cron (C1-44). Include unit, customer/site, address + maps link, time in company zone, a link
   to the staff scan page `/e/<code>` and to the request.
6. `/api/service-requests` and `/api/owner-requests` respond right after the RPC; AI summary and emails move into
   `after()`; summary calls get `timeout: 8000, maxRetries: 1` and use the existing `CLASSIFIER_MODEL` (Haiku) for
   the short summary (Q-05).
7. Senders report truthfully (`notifyRequesterOfStatus` and friends return whether anything was sent) so QoL-2a can
   show honest toasts. Keep call sites compiling.
8. `docs/EMAILS.md` lists every builder: trigger, recipients, branding, Reply-To (C1-47).

### QoL-2a — Technician on the phone
Owns: `src/app/e/[qrToken]/staff/**`, `src/app/e/[qrToken]/staff-actions.ts` (except QoL-1's email hunks),
`src/app/e/[qrToken]/inspect/**`, `src/app/dashboard/requests/[id]/close-request-dialog.tsx`,
`src/components/ui/sonner.tsx`, `src/lib/client-image.ts`.
1. Staff scan view shows what the tech needs at the machine (Q-48, C1-13): customer/site name, address with
   Directions, site contact Call/Text, a highlighted "Notes for techs" (equipment notes), serial, warranty state,
   custom fields, manuals/documents (signed URLs), and request cards that expand to photos + AI summary. Recent
   history open by default when ≤ 3 items.
2. Lock state (C1-33): a locked company's staff see a clear banner and disabled job actions; staff server actions
   check the lock *before* any upload starts.
3. Owner-kind staff scan uses vocab; hide "On my way" and "Start inspection" for owner kind (C1-03).
4. Honest "On my way" per §2 (Q-03, C1-31).
5. Close-out never loses work, phone and desktop (Q-04, Q-51, Q-54): keep state on dismiss, confirm "Discard
   close-out?" when dirty, save summary/recommendations drafts in localStorage per request (wrapped in try/catch,
   cleared on success), sticky submit footer, toasts top-center on small screens, success state offers "Back to
   Today" and — when there's no email — "Text {name} a summary" with the `/r/` link.
6. Inspection item photos show thumbnails (Q-52); image downscale falls back to the original file ≤ 12 MB (Q-53).

### QoL-2b — Customer, restaurant & vendor pages
Owns: `src/app/e/[qrToken]/page.tsx`, `src/app/e/[qrToken]/{request,owner}/**`, guide walkthrough components,
`src/app/r/**`, `src/app/v/**`, `src/components/public/**`, `src/lib/public-request.ts`, new `src/app/e/page.tsx`,
`src/app/e/[qrToken]/not-found.tsx`, `src/app/e/[qrToken]/loading.tsx`, a new token-keyed `.ics` route for `/r/`.
1. `/e` code-entry page (large input, auto-uppercase, `normalizeShortCode`, redirect) and a friendly unknown-code
   page with the same input (Q-06).
2. Scan page names the company next to a logo, labels CTAs "Call {company}" / "Text {company}", and says "Serviced by
   {company}" under the unit on provider tags; `BrandShell` sets `--primary`, `--primary-foreground` and `--ring`
   from the brand so every control inherits it (Q-56, C1-49).
3. `/r/`: brand-coloured Send, staff replies attributed "{name} · {company}" where the data exists, add-to-calendar
   `.ics` for a booked visit (only data `/r/` already shows; rate-limited like `/r/`) (Q-57). Skip customer photo
   thumbnails if the status RPC doesn't return media.
4. Report forms: `noValidate` with inline field errors and scroll-to-first-error; the gas/smoke/sparking/burning
   hazard banner on the provider form too, sharing one pattern in `public-request.ts`; drafts of text fields and
   urgency saved per token with a "Restored your draft" note (Q-58, Q-59, Q-54).
5. Restaurant confirmation only says "Sent to {vendor}" when a dispatch was created; otherwise "We couldn't send
   this to {vendor} automatically — call them now" with a Call button (C1-30, Q-12).
6. Vendor page: shared priority badge, state-aware primary action, styled "Attach invoice (PDF or photo)" control,
   "Call the kitchen" from the phone the RPC already returns (Q-11, Q-61).
7. Neutral loading skeleton for `/e/[qrToken]`; kind-neutral copy on retired/unclaimed stickers (C1-04 copy only).

### QoL-3 — First run, activation & upgrade moments
Owns: `src/app/(auth)/**`, `src/app/auth/**`, `src/app/dashboard/page.tsx` + its components,
`src/app/dashboard/equipment/page.tsx`, `new-equipment-dialog.tsx`, `src/app/dashboard/equipment/actions.ts`,
`src/app/dashboard/equipment/[id]/edit-equipment-form.tsx`, `src/app/dashboard/equipment/[id]/label/page.tsx`,
`src/app/dashboard/equipment/[id]/qr/**`, `src/lib/equipment.ts`, equipment-type create dialog + type page,
inline-create actions in `equipment-types/actions.ts` and `customers/actions.ts`, `src/app/e/[qrToken]/onboard/**`
+ the onboarding action in `src/app/e/[qrToken]/actions.ts`, `src/app/dashboard/locations/page.tsx`,
`src/components/billing/locked-screen.tsx`, `src/app/dashboard/settings/billing/page.tsx` + plan cards,
`src/app/admin/page.tsx`.
1. Equipment types stop being a gate (Q-17): a type combobox with "+ Create '…'" in the new-equipment dialog and in
   blank-sticker onboarding; New equipment is never disabled; empty states have a primary action.
2. New-equipment flow (Q-24, Q-25): short first tier (name, type, customer with inline create — or location/vendor
   for owner kind — and where on site), "More details" disclosure, "Create & print sticker" and "Create & add
   another" (keeps type/customer), trade-appropriate placeholders, fixed radio label layout, errors shown next to
   submit with a Billing link on limit errors.
3. Blank-sticker onboarding gains inline type/customer create and a "Scan next sticker" loop that keeps the
   selections (Q-55).
4. First-run overview (Q-19, Q-20, Q-08): with zero units show a "Get your first sticker live" hero (add a unit →
   print its sticker → scan it with your phone); checklist is truthful (printed = a code has `label_printed_at`; PNG
   and SVG downloads stamp it too), adds "Scan your sticker with your phone" (a scan event exists) and "Add the phone
   number customers can call"; checklist links open the right dialog (`?new=1`).
5. Overview for daily use (Q-33, C1-28): every metric links to its `REQUEST_BUCKETS` href and counts with the same
   applier; a Today card (visits today in company time) linking `/dashboard/today`; a PM-due (7 days) card; recent
   rows show customer, problem and assignee.
6. Limits visible before work (Q-10, C1-41): at-limit banners on equipment and locations with an upgrade link that
   names the account's own plans; usage card on Overview at ≥ 80%.
7. Locked screen and billing that convert (Q-42, Q-43): "Your stickers still work — customers have sent N requests
   since your trial ended. Your data is safe." + recommended plan by usage + plan cards; non-owners are told who to
   ask. Billing shows "Fits your usage" and "No active plan" when locked.
8. Signup (Q-21): one email (a disclosure to send new requests elsewhere), show/hide password instead of confirm,
   kind cards that don't crush at desktop widths, reassurance line per kind (§2 trial copy); keep `?plan=` in the
   auth user metadata for later.
9. Account recovery (Q-22, C1-56): "Forgot password?" → reset request page → set-new-password page, "Resend email"
   on the check-your-email step, and a clear message when a confirmation link has expired.
10. After creating an equipment type, offer "Add a unit of this type" (Q-23).
11. Equipment search matches sticker short codes (Q-31); warranty badge rule from §2 (Q-41); delete dialog per §2
    (Q-13).
12. Platform admin page shows an activation table per company: signed up, first unit, first label printed, first
    scan, first scan-originated request.

### QoL-4 — The office daily loop
Owns: `src/app/dashboard/requests/**` except `close-request-dialog.tsx` internals, `schedule-actions.ts` and
QoL-1's email hunks; `src/app/dashboard/schedule/**`, `src/app/dashboard/maintenance/page.tsx`, new
`src/app/dashboard/today/**`, `src/app/dashboard/customers/[id]/page.tsx`, `src/app/dashboard/customers/page.tsx`,
the New-request entry on `src/app/dashboard/equipment/[id]/page.tsx`, `src/app/dashboard/equipment/labels/**`,
`src/app/dashboard/loading.tsx`, `src/app/dashboard/requests/[id]/loading.tsx`.
1. Log a phone-in request (Q-28, C1-26): "New request" on the inbox, equipment detail and customer detail opens a
   sheet (unit search by name/serial/code, preselected in context; description; priority; contact prefilled from
   the customer; optional visit; optional "Email the customer a status link"). Inserts `source='staff'` (allowed by
   0020), writes the same activity/event rows other staff paths write. Owner kind labels it "New work order".
2. Inbox triage (Q-29, Q-07, Q-18): Problem column (AI summary or description), whole-row link, Visit column and
   sort, reference shown and searchable, `?bucket=` honoured via `REQUEST_BUCKETS`, zero-state copy distinct from
   "no matches" with Clear filters.
3. Mobile inbox (Q-30): cards below `md`, filters in a "Filters (n)" sheet with status chips inline.
4. Field-ready request detail (Q-34, Q-35): site address + Directions, site contact Call/Text, status link Copy and
   Text, visible labels on Priority/Status/Assignee, mobile order (header → quick actions → description/media →
   visit → activity) with a sticky "Close out" bar.
5. Choosing "Resolved" in the status control opens the close-out dialog (Q-14).
6. Schedule gets a Today button and a Visits | Maintenance tab header shared with the maintenance page (Q-36, Q-37).
7. `/dashboard/today` for provider kind (Q-47): visits today in company time order (time, customer, address +
   Directions, unit, problem, status), overdue visits, assigned to me but unscheduled, PM due this week; each card
   has Call · Directions · Open unit (`/e/<code>`) · Open request. Owner kind redirects to the work-order inbox.
8. Customer pages (Q-38, Q-39): read-only header with Directions/Call/Email and an Edit toggle; actions New request,
   Add equipment (`?customer=`), Print stickers (`/dashboard/equipment/labels?customer=`); list search plus Units and
   Open columns; the label builder honours `?customer=`.
9. Owner-kind work-order detail (C1-02, Q-60): Location + vendor card instead of Customer, "Back to work orders",
   "Mark fixed" instead of "Close out", no "emails them too" copy without a contact email, no Visit card (the vendor
   ETA lives in the dispatch panel).
10. Loading skeletons for `/dashboard` and request detail (Q-45).

### QoL-5 — Platform gates, app shell & launch hygiene
Owns: `src/lib/api-auth.ts`, `src/lib/webhooks.ts`, `src/app/api/cron/webhooks/**`, `src/app/api/stripe/webhook/**`,
`src/app/dashboard/settings/billing/actions.ts`, `src/app/api/export/**`, `src/app/dashboard/settings/team/**`,
`settings-subnav.tsx`, `settings/api/page.tsx`, upsell copy in `settings/branding/branding-form.tsx`,
`settings/qr-codes/page.tsx` and `checklists/actions.ts`, delete actions + delete-button visibility for types,
guides, customers, locations and vendors, `draftGuideWithAI`, `src/components/billing/trial-banner.tsx`,
`src/components/dashboard-nav*.ts(x)`, `dashboard-topnav.tsx`, `sign-out-button.tsx`, `src/app/dashboard/layout.tsx`,
`src/app/dashboard/settings/account/**`, `maintenance/schedule-row-actions.tsx`, `src/lib/features.ts`,
`src/app/admin/layout.tsx`, `src/lib/env.ts`, `src/app/api/health/**`, `.github/workflows/**`, `scripts/**`,
`LAUNCH.md`, `README.md`, `CONTRIBUTING.md`, `docs/*.md` except `EMAILS.md` and this brief.
1. API keys and webhook delivery re-check the plan and lock at use time: API returns 402 JSON when not entitled;
   the drain skips deliveries for non-entitled companies (C1-36).
2. Stripe webhook ignores a price whose plan kind differs from the company's kind (logs, returns 200); the portal
   session uses `STRIPE_PORTAL_CONFIG_PROVIDER` / `STRIPE_PORTAL_CONFIG_OWNER` when set; `stripe-setup.mjs` can
   create them (don't run it) (C1-39).
3. Deletes that RLS can filter check the affected row count and return "Only owners can delete …"; delete buttons
   are hidden from non-owners; CSV export requires the owner role like its UI; team role menu includes Manager,
   pending invites show the right role, members list uses cards on mobile (C1-38, Q-46).
4. `draftGuideWithAI` checks the lock and a rate limit like checklist AI (C1-37, gating decision left open).
5. Upsell copy names the account's own kind's plans; the API settings tab is hidden for owner kind (C1-06).
6. App shell: active nav = longest matching href (Q-09); nav order + Today link + Requests badge per §2 (Q-32);
   role-aware trial banner that escalates at ≤ 3 days (Q-15); settings subnav filtered by role (Q-16); on mobile
   the active pill scrolls into view, pills are 44px, Sign out moves out of the header into Account (Q-49); a Scan
   button in the mobile header opens the camera and routes to `/e/<code>` (Q-50); skip link and `aria-label`s on
   icon-only buttons (Q-64).
7. Remove the dead `FEATURES.ownerAccounts` flag and its doc mentions; gate the admin console only on platform admin,
   not on `batchQr` (C1-42).
8. Production env guard: when `VERCEL_ENV === "production"`, fail fast if `NEXT_PUBLIC_APP_URL` is missing or
   localhost, or the service-role key, Resend settings or `CRON_SECRET` are missing — without breaking CI builds;
   `/api/health?deep=1` behind `CRON_SECRET` reports which integrations are configured (booleans only); compare
   `CRON_SECRET` with `timingSafeEqual` (C1-53, C1-54).
9. CI job that applies the Supabase shim + migrations 0001–0026 to Postgres 16 and runs the four smoke SQL files
   (C1-57). Validate locally against a separate database name so the local stack isn't clobbered.
10. Rewrite `LAUNCH.md` against `main` and fix drift in README/TEAMS/BILLING/API/BATCH-QR/MARKETING (C1-52, C1-55):
    migrations through 0026, 5 crons, all Stripe prices including the 4 owner prices, env vars (including this
    pass's), Resend domain + Supabase Auth SMTP, Supabase Pro, canonical `https://equipqr.co`.

### QoL-6 — Marketing honesty & design tokens
Owns: `src/app/(marketing)/**`, `src/app/globals.css`, `DEFAULT_BRAND_COLOR` in `src/lib/branding.ts`,
`src/components/status-badge.tsx` colours, the contrast warning in `settings/branding/branding-form.tsx`, plan
highlight copy in `src/lib/plans.ts`.
1. Sticker claims match reality (C1-40): self-printed on label sheets or a label printer, the real sizes in
   `src/lib/labels/sticker-sizes.ts`, guidance to use weatherproof label stock in kitchens (advice, not a product
   claim), logo only where it actually prints, no ordering claim.
2. The marketing dashboard mock shows only things the app has after this pass — no "Resolved by guide" metric
   (Q-27 short term).
3. Pricing compare table gains an "Included in every plan" group listing only real features: scheduling and
   reminders, PM schedules, checklists and inspections, phone close-out with photos and signature, customer status
   page and messages (Q-63).
4. Owner trial copy matches code: every restaurant account gets 14 days of Kitchen features, then Free; the
   Multi-kitchen card doesn't promise a Multi-kitchen trial (C1-35 copy).
5. "Have a sticker code?" link in the marketing header and footer → `/e`; skip link in the marketing layout (Q-06,
   Q-64).
6. Privacy policy's subprocessor list includes every service actually wired (Sentry is missing today).
7. AA contrast (Q-26): app `--primary` for text/buttons at teal-700 strength, `DEFAULT_BRAND_COLOR = "#0f766e"`,
   darker badge text, and a warning in Branding settings when a chosen colour with white text is under 4.5:1.
8. Owner plan copy says "work orders" (C1-07).
9. Report every claim you changed (before → after) with the code that proves it.

## 4. After the workstreams merge (QoL-7 sweep)

A final pass on the merged branch replaces the remaining `toLocale*` call sites with company-zone helpers and adds an
ESLint rule against them (Q-02, C1-22), runs the vocabulary codemod on owner-reachable surfaces (C1-01, C1-05, C1-07,
Q-60), and updates docs for everything this pass added. Then: full lint, typecheck, test suite, production build,
local click-through on the demo stack, and an independent review.

## 5. Explicitly out of scope (need a decision, a migration, or a later pass)

Global ⌘K search, equipment overview tab, shared confirm dialog with undo, guide preview, schedule agenda view, bulk
inbox actions, provider starter templates, request domain functions in SQL, `location_id` propagation trigger,
seat-limit trigger, retiring frees capacity, dispatch lifecycle on cancel/close, webhook payload hydration,
app-shell theme refresh, close-out record v2 (parts/labor), warranty packets, SMS provider, offline outbox.
