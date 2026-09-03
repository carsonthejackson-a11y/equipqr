# Runbook

Incident response notes for EquipQR. Check `GET /api/health` first for any incident — it tells
you in one request whether the app process is up and whether it can reach Supabase.

## Supabase is down or unreachable

**Symptoms**: `/api/health` returns `503` with `checks.supabase: "error"`; dashboard pages show
errors loading data; the public `/e/[qrToken]` scan page fails to resolve codes; login/signup
fail.

1. Check [status.supabase.com](https://status.supabase.com) for an active incident.
2. Check the project's own health in the Supabase dashboard (Project → Reports, or just try
   opening the SQL Editor).
3. If it's a Supabase-side outage: there's nothing to fix on our end. Post a status update if
   you have a customer-facing status page; otherwise wait it out — Supabase's own status page
   is the source of truth for an ETA.
4. If the project itself looks fine but `/api/health` still fails: check that
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the deployment still match
   the project (a key rotation or a redeploy against the wrong project are the usual causes),
   and that the anon key hasn't been rotated/revoked in Supabase without updating Vercel.
5. Once resolved, confirm `/api/health` returns `200` before considering it closed.

**Auth is up but data queries fail (RLS)**: if `auth.getUser()` works but every table query
comes back empty or errors for logged-in users, check for a recent migration that changed a
policy or `get_my_company_id()` — this is the most common self-inflicted outage. Revert the
migration by adding a new one that restores the previous policy (never edit the old migration
file — see `docs/AGENT-BRIEF.md`).

## Resend is bouncing / rejecting email

**Symptoms**: customers report not receiving service-request confirmation or resolution
emails; `src/app/dashboard/requests/actions.ts` / `src/app/api/service-requests/route.ts` log
`"RESEND_API_KEY or RESEND_FROM_EMAIL not configured"` (config missing) or a send error from
the Resend API (config present but rejected).

1. Confirm `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set in the deployment's environment —
   if either is unset, sends are silently skipped (this is intentional; it's not a crash, but
   it does mean no emails go out).
2. Check the [Resend dashboard](https://resend.com/emails) for the actual send attempts and
   their status (delivered / bounced / complained).
3. **Domain verification lapsed**: if `RESEND_FROM_EMAIL`'s domain shows as unverified in
   Resend → Domains, re-verify the DNS records (SPF/DKIM) with whoever manages that domain's
   DNS.
4. **High bounce rate**: Resend throttles or suspends senders with a bad reputation. Check
   Resend → Domains → your domain for a reputation warning. Sending to a `+test` inbox from the
   dashboard is fine; sending large volumes to bad/typo'd addresses is what triggers this — the
   customer-facing service-request form should already validate emails via zod, but audit
   recent submissions for the pattern if this happens.
5. Emails aren't queued or retried by the app — a failed send is just logged and swallowed so
   it never blocks the underlying action (a request still gets created/resolved even if the
   notification email fails). There's no automatic replay: if a customer needs their email
   resent, do it manually (resend the resolution from the request detail page, or reach out
   directly).

## Stripe webhook failures

**Symptoms**: a subscription change (upgrade, downgrade, cancellation, payment failure) made
in Stripe doesn't reflect in the app — billing state (see `docs/BILLING.md`) goes stale.

1. **Stripe Dashboard → Developers → Webhooks → your endpoint** — check the "Events" tab for
   recent delivery attempts and their response codes.
2. A `4xx`/`5xx` response usually means:
   - The endpoint is misconfigured or the deployment is down — check `/api/health` first.
   - `STRIPE_WEBHOOK_SECRET` on the deployment doesn't match the endpoint's signing secret in
     Stripe (common after rotating the secret or pointing a new deployment at an existing
     endpoint) — signature verification fails and the handler rejects the event before doing
     anything with it.
3. **Replay a failed event**: in Stripe Dashboard → Developers → Webhooks → your endpoint →
   the failed event → **Resend**. This redelivers the exact same event payload; the handler
   should be idempotent (safe to receive the same event twice), so resending is safe.
4. **Replay in bulk / from the CLI**: `stripe events resend <event_id>`, or for a wider gap,
   `stripe listen --forward-to <url>` from a trusted machine while manually triggering the
   affected events isn't practical for production data — prefer the dashboard's per-event
   resend, or reach out to Stripe support for a bulk redelivery if a long outage caused a
   large backlog.
5. Once caught up, spot-check a few affected companies' billing state in the dashboard against
   Stripe's view of their subscription to confirm they've reconciled.

## Something's throwing and Sentry isn't configured

If `SENTRY_DSN` isn't set on a deployment, errors are only visible in Vercel's function logs
(Vercel dashboard → your project → Logs, or `vercel logs`) and the browser console — there's no
aggregation or alerting. Set `SENTRY_DSN` (see README → Operations) to get that back; no code
changes are needed, it activates on the next deploy.
