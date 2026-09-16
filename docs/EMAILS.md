# Emails

Every transactional email EquipQR sends is built on the shared shell in
`src/lib/email/layout.ts` (`renderEmail()` for the HTML, `renderEmailText()`
for the plain-text fallback) and goes out through one of two senders in
`src/lib/email/`, both of which read `RESEND_API_KEY` / `RESEND_FROM_EMAIL`,
no-op with a `console.warn` when either is unset, and never throw (a
failed/skipped send is always logged and swallowed, never allowed to break
the action that triggered it):

- **`send.ts`'s `sendEmail()`** — the plain EquipQR-branded sender. Use this
  for anything **staff-facing**: an email that lands in a teammate's or the
  company's own inbox (invites, the new-request/PM/dispatch/vendor-reply
  notifications, Welcome, Trial ending, the assignee notification). These
  are EquipQR talking to the company or its people, so EquipQR's own
  branding is correct.
- **`company-email.ts`'s `sendCompanyEmail()`** — the company-branded
  sender: From `"<Company> via EquipQR"`, Reply-To the company's own
  `notification_email` (overridable per call). Use this for anything
  **customer-facing**: an email a *customer* (or, for an `equipment_owner`
  company, the staff member who reported a problem) receives about their
  own request — received, status update, visit reminder, PM due, resolved
  (C1-43/C1-45). A customer should see the company they contacted, not
  "EquipQR", in their inbox.

Getting this split wrong in either direction is the kind of thing to
double-check when adding a row below: a staff notification that leaks a
requester's Reply-To into the company's own inbox is merely convenient; a
customer email sent as plain EquipQR is a trust bug (C1-43).

| Email | Trigger | Recipient | Branding & Reply-To | Builder / sent from |
| --- | --- | --- | --- | --- |
| New request notification | A customer submits via the public QR scan flow (`POST /api/service-requests`, provider-kind only — `submit_service_request()` rejects `equipment_owner` equipment) or a PM schedule comes due (`cron/pm-due`, either kind) | Company's `notification_email` | Plain EquipQR (`sendEmail`). Reply-To is the **requester's own email** when they gave one (sanitized via `sanitizeEmailHeader()`) — not the company's inbox, so staff hitting "reply" lands with the customer, not themselves | `service-request-notification.ts` (`buildServiceRequestNotificationEmail`), sent from `api/service-requests/route.ts` and `cron/pm-due/route.ts`. Vocab-aware — "New service request" / "New work order" (C1-05) |
| Request received (receipt) | Right after a provider-kind customer submits (`POST /api/service-requests`) | Requester's email, when given and `customer_updates_enabled` | Company-branded (`sendCompanyEmail`); Reply-To the company's own `notification_email` | `request-status.ts` (`buildRequestReceivedEmail`), sent from `api/service-requests/route.ts`'s `sendRequesterReceipt`. Runs inside that route's `after()` callback, so it never blocks the submit response |
| Status update | Staff changes status, assigns someone, adds a customer-visible note, cancels, or schedules/reschedules a visit | Requester's email, when `customer_updates_enabled` | Company-branded (`sendCompanyEmail`); Reply-To the company's own inbox | `request-status.ts` (`buildRequestStatusUpdateEmail`, sent via `notifyRequesterOfStatus`), called from `dashboard/requests/actions.ts`, `dashboard/requests/schedule-actions.ts`, `e/[qrToken]/staff-actions.ts`'s `sendOnMyWay`, and the v1 API's `notifyRequesterFromApi`. A scheduled visit's time renders in the company's own timezone with a zone label (C1-23/Q-01), never the server's; vocab-aware (C1-05). `notifyRequesterOfStatus()` returns whether it actually sent — read the doc comment on it before changing that signature, other workstreams' toasts depend on it |
| Visit reminder | Daily cron, ~1–1.5 days ahead of a scheduled visit | Requester's email | Company-branded (`sendCompanyEmail`); Reply-To the company's own inbox | `visit-reminder.ts` (`buildVisitReminderEmail`), sent from `cron/visit-reminders/route.ts`. Idempotent via `service_requests.reminder_sent_at`, claimed atomically before sending (and released if the send is skipped/fails) so overlapping runs can't double-email |
| PM due | Daily cron generates a `source='pm'` request and the customer opted in (`notify_customer && customer_updates_enabled && contact_email`) | Customer on file — in practice provider-kind only: an owner-kind unit has no `customer_id`, so `generate_due_maintenance_requests()` never resolves a `contact_email` for one | Company-branded (`sendCompanyEmail`); Reply-To the company's own inbox | `pm-due.ts` (`buildPmDueEmail`), sent from `cron/pm-due/route.ts` |
| Service completed (resolution) | Staff marks a request resolved with "email the customer" checked, from the dashboard close-out or the staff-scan close-out | Requester's email | Company-branded (`sendCompanyEmail`) — this was the one customer email that stayed EquipQR-branded with hard-coded teal until C1-45; Reply-To the company's own inbox | `resolution.ts` (`buildResolutionEmail`), sent from `dashboard/requests/actions.ts`'s `closeServiceRequest` and `e/[qrToken]/staff-actions.ts`'s `closeOutFromScan`. Records `service_requests.resolution_email_sent_at` only when the send actually succeeds; vocab-aware (`requestNoun`, defaults to "service request") |
| Assignee notification | A technician is assigned (never when they assigned it to themselves), a visit is scheduled or rescheduled, or the visit-reminders cron fires for a scheduled visit that has an assignee | The assigned technician's own email | Plain EquipQR (`sendEmail`) — staff-facing, never the company's own branding | `assignment.ts` (`buildAssigneeNotificationEmail`), sent from `dashboard/requests/actions.ts`'s `notifyAssignee`, `dashboard/requests/schedule-actions.ts`'s `notifyAssigneeOfSchedule`, and `cron/visit-reminders/route.ts` (C1-44). Links to the unit's staff scan page (`/e/<code>`) when it has one, with the full dashboard request as a secondary link, else the dashboard request alone; includes a clickable Maps link on the address and the time in the company's own zone. The cron's assignee reminder rides the same `customer_updates_enabled` gate and claim window as the customer reminder — there's no separate column to track it independently without a migration |
| Customer message notification | A customer adds a message/reply on `/r/<token>` | Company's `notification_email` and/or the assigned staff member's email (deduped) | Plain EquipQR (`sendEmail`) — staff-facing | `customer-message.ts` (`buildCustomerMessageEmail`), sent from `api/request-updates/route.ts`, deferred with `after()` so it never blocks that route's response |
| Welcome | Once, right after a company is created (first dashboard load after signup) | Company's `notification_email` | Plain EquipQR (`sendEmail`) — this is EquipQR talking to the company about its own account, not a customer email | `welcome.ts` (`buildWelcomeEmail`), sent from `dashboard/layout.tsx`, deferred with `after()`. Idempotent via `companies.welcome_email_sent_at` — checked before sending and set only after a successful send. Per-kind steps and trial-line copy (C1-05): the owner-kind version mirrors the first-run wizard (location, then equipment types) instead of the provider's "gear you service" wording |
| Trial ending soon | Daily cron, when a company's trial ends within 3 days and it has no active subscription | Every `owner` profile on the company | Plain EquipQR (`sendEmail`) — same reasoning as Welcome | `trial-ending.ts` (`buildTrialEndingEmail`), sent from `cron/trial-reminders/route.ts` to every `owner` profile. Idempotent via `companies.trial_reminder_sent_at` (set once attempted, regardless of Resend outcome — a "did we run" flag, not a delivery receipt). Per-kind copy (C1-34): a `service_provider` is told the dashboard will pause while stickers/scan/intake keep working; an `equipment_owner` is told they'll drop to the Free plan and their account never locks — never the old, kind-blind "keep your QR pages working" claim. See "Cron jobs" in `docs/RUNBOOK.md` |
| Team invitation | An owner invites someone on **Team** → Invite member (or resends one) | Invitee's email | Plain EquipQR (`sendEmail`); no Reply-To override | `invite.ts` (`buildInviteEmail`), sent from `dashboard/settings/team/actions.ts` |
| Vendor dispatch | An `equipment_owner` company's unit resolves to a vendor on submission (`POST /api/owner-requests`), or staff manually dispatch one from **Requests** → a request | `vendors.email` | Plain EquipQR (`sendEmail`); Reply-To the owner's `companies.notification_email` via `sanitizeEmailHeader()` | `vendor-dispatch.ts` (`buildVendorDispatchEmail`), sent from `api/owner-requests/route.ts`, `api/dispatch-to-vendor/route.ts` (first dispatch) and `dashboard/requests/dispatch-actions.ts` (`resendDispatch`). Links to `/v/<dispatch token>`; delivery outcome stamped back via `mark_dispatch_sent()` |
| Owner new-request notification | An owner-kind submission resolves to a vendor | Company's `notification_email` | Plain EquipQR (`sendEmail`) | `owner-notifications.ts` (`buildOwnerNewRequestEmail`), sent from `api/owner-requests/route.ts`. Names the vendor and links to the request in the dashboard |
| Owner no-vendor notification | An owner-kind submission has no vendor to resolve to | Company's `notification_email` | Plain EquipQR (`sendEmail`) | `owner-notifications.ts` (`buildOwnerNoVendorEmail`), sent from `api/owner-requests/route.ts`. Links to the equipment page instead of a dispatch |
| Vendor status update | A vendor acknowledges, gives an ETA, adds a note, finishes, declines or attaches an invoice on `/v/<token>` | Company's `notification_email` | Plain EquipQR (`sendEmail`) | `owner-notifications.ts` (`buildOwnerDispatchUpdateEmail`), sent from `api/vendor-actions/route.ts` and `api/vendor-invoice/route.ts`. ETA renders in the company's own timezone |
| Dispatch stuck (no vendor response) | Hourly `dispatch-sla` cron, when a `sent`/`viewed` dispatch has had no vendor response past its SLA window | Company's `notification_email` | Plain EquipQR (`sendEmail`) | `dispatch-sla.ts` (`buildDispatchSlaAlertEmail`), sent from `cron/dispatch-sla/route.ts`. Leads with the vendor's phone number and the "EquipQR can't confirm a vendor received an email" liability line. Idempotent via `dispatches.sla_alerted_at`, claimed with `claim_dispatch_sla_alerts()` (`UPDATE ... FOR UPDATE SKIP LOCKED`) so two overlapping cron runs can't double-alert. See "Cron jobs" in `docs/RUNBOOK.md` |

## Adding a new email

1. Add a `build*Email()` function in `src/lib/email/<name>.ts` that returns
   `{ subject, html, text }`, built from `renderEmail()` / `renderEmailText()`
   in `layout.ts` (don't hand-roll HTML — the shared shell keeps every email
   visually consistent and gives you the plain-text fallback for free). If
   the email touches a noun that differs by company kind (a "service
   request" vs. a "work order", a "customer" vs. a "vendor"), take a `vocab:
   Vocab` param (`@/lib/vocab`'s `vocabFor()`) rather than hard-coding the
   provider wording — see `request-status.ts` or
   `service-request-notification.ts` for the pattern.
2. Decide which sender it needs (see the split explained above) and call it
   from wherever the trigger lives:
   - **Staff-facing** → `sendEmail({ to, subject, html, text })`.
   - **Customer-facing** → `sendCompanyEmail({ company: { name,
     notification_email }, to, subject, html, text })`, and give the builder
     a `brand: RequestEmailBranding` (via `brandingForEmail()` in
     `request-status.ts`) instead of a bare company name, so it renders with
     the company's logo/color like every other customer email.
   Neither sender throws, but if the trigger is best-effort/idempotent (like
   Welcome or Trial ending), wrap the whole send-and-flag sequence in its own
   `try/catch` too — and if the trigger is a request/response route handler,
   consider deferring the whole send past the response with `after()` (see
   `api/service-requests/route.ts` or `api/request-updates/route.ts`) rather
   than making the caller wait on it.
3. Add a row to the table above: trigger, recipient, branding + Reply-To,
   and the builder/call sites.
