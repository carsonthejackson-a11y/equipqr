# Emails

Every transactional email EquipQR sends, all built on the shared shell in
`src/lib/email/layout.ts` (`renderEmail()` for the HTML, `renderEmailText()`
for the plain-text fallback) and sent through `src/lib/email/send.ts`'s
`sendEmail()` — a thin Resend wrapper that reads `RESEND_API_KEY` /
`RESEND_FROM_EMAIL`, no-ops with a `console.warn` when either is unset, and
never throws (a failed/skipped send is always logged and swallowed, never
allowed to break the action that triggered it).

| Email | Trigger | Template |
| --- | --- | --- |
| Team invitation | An owner invites someone on **Team** → Invite member (or resends one) | `src/lib/email/invite.ts` (`buildInviteEmail`), sent from `src/app/dashboard/settings/team/actions.ts` |
| New service request notification | A customer submits a service request from the public QR guide (`POST /api/service-requests`) | `src/lib/email/service-request-notification.ts` (`buildServiceRequestNotificationEmail`), sent from `src/app/api/service-requests/route.ts`. Includes the AI summary (when generated), the troubleshooting path taken, attachment count, and a link to the request in the dashboard. |
| Service completed (resolution) | Staff marks a request resolved on **Requests** → a request → close-out, with "email the customer" checked | `src/lib/email/resolution.ts` (`buildResolutionEmail`), sent from `src/app/dashboard/requests/actions.ts`. Records `service_requests.resolution_email_sent_at` on success. |
| Welcome | Once, right after a company is created (first dashboard load after signup) | `src/lib/email/welcome.ts` (`buildWelcomeEmail`), sent from `src/app/dashboard/layout.tsx`. Idempotent via `companies.welcome_email_sent_at` — checked before sending and set after, so a retried/duplicate request never double-sends. |
| Trial ending soon | Daily cron, when a company's trial ends within 3 days and it has no active subscription | `src/lib/email/trial-ending.ts` (`buildTrialEndingEmail`), sent from `src/app/api/cron/trial-reminders/route.ts` to every `owner` profile on the company. Idempotent via `companies.trial_reminder_sent_at` (set once attempted, regardless of Resend outcome — this is a "did we run" flag, not a delivery receipt). See "Cron jobs" in `docs/RUNBOOK.md`. |

## Adding a new email

1. Add a `build*Email()` function in `src/lib/email/<name>.ts` that returns
   `{ subject, html, text }`, built from `renderEmail()` / `renderEmailText()`
   in `layout.ts` (don't hand-roll HTML — the shared shell keeps every email
   visually consistent and gives you the plain-text fallback for free).
2. Call `sendEmail({ to, subject, html, text })` from wherever the trigger
   lives. Never `await` it in a way that would fail the caller — `sendEmail`
   already never throws, but if the trigger is best-effort/idempotent (like
   Welcome or Trial ending), wrap the whole send-and-flag sequence in its own
   `try/catch` too.
3. Add a row to the table above.
