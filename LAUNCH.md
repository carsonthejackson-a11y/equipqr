# EquipQR — launch checklist

**Gate 0 first.** Those seven items are silent failure modes, not missing features — get one
wrong and the app looks like it's working right up until a real customer hits the gap. A couple
of them (DNS verification, proving a Supabase restore) need lead time, so start Gate 0 before
you start the numbered steps below and let the slow parts run in the background.

Everything after Gate 0 is the original step-by-step: work top to bottom, each step says how to
verify it.

Budget: Gate 0 is roughly 60–90 minutes of hands-on work, plus however long Resend's domain
verification takes to clear (often instant, sometimes up to ~48h depending on your DNS host).
Steps 1–7 below are another 90–120 minutes.

The detailed docs behind each step: `README.md` (setup/deploy), `docs/BILLING.md` (Stripe),
`docs/TEAMS.md` (invites/roles), `docs/EMAILS.md` (every email), `docs/RUNBOOK.md` (incidents),
`docs/API.md` (CSV export, webhooks, the public API), `docs/BATCH-QR.md` (pre-printed sticker
batches — on by default now, and how to turn them back off).

---

## Gate 0 — before merging these PRs or putting a sticker on a customer's machine

**0.1. Verify `equipqr.co` in Resend.** Resend → Domains → add `equipqr.co`, add the DNS records
it gives you, wait for "Verified" (can take a while depending on your DNS host — start this
first). Every `RESEND_FROM_EMAIL` example in this doc assumes this domain, e.g.
`EquipQR <notify@equipqr.co>`.
**Verify:** Resend → Domains shows `equipqr.co` as Verified, not Pending.

**0.2. Switch Supabase Auth off its default mailer.** Out of the box, Supabase's built-in email
only reaches addresses on your own Supabase team — it silently refuses everyone else — and is
rate-limited to about 2 emails/hour. That's fine for development, but it means every signup
confirmation, password reset, and invite email a real customer needs would silently never arrive.
In Supabase → Authentication → Emails → SMTP Settings, enable "Custom SMTP" and point it at
Resend (host `smtp.resend.com`, port `587`, username `resend`, password = your `RESEND_API_KEY`),
sending from the `equipqr.co` address verified in 0.1.
**Verify:** there's no dashboard indicator that actually proves this works — 0.3 below is the
real verification. Don't skip it.

**0.3. Test signup → confirm → password-reset end to end with a non-team Gmail address** —
specifically *not* an address on your own Supabase team, which would appear to work even if 0.2
were skipped and give you a false pass. Sign up fresh, confirm from the email link, then use
"Forgot password" and reset from that email too.
**Verify:** both emails land in the Gmail inbox within a minute or two, and both links work end
to end (confirmation logs you in; the reset link lets you set a new password and log in with it).

**0.4. Upgrade the Supabase project to Pro, and prove you can restore.** A free-tier project
pauses itself after about a week of inactivity — real downtime for whoever hits it right then,
even though a support request wakes it back up — and free-tier projects have no backups at all:
if the database is lost, it's gone. Upgrade in Supabase → Project Settings → Billing, then either
restore a Point-in-Time Recovery snapshot into a branch and confirm the data's there, or stand up
a nightly `pg_dump` to storage you control and confirm one dump file actually contains your
tables.
**Verify:** you've watched a restore (or a dump) succeed at least once — not just turned the
setting on.

**0.5. Confirm the Vercel team is on Pro, not Hobby.** Hobby silently rejects any cron schedule
more frequent than daily. This project's `vercel.json` needs `*/5 * * * *` (`webhooks`) and
hourly (`dispatch-sla`) — on Hobby those two simply never run: no error, no email, nothing.
**Verify:** Vercel → Project → Settings → Crons shows all 5 schedules as active, not disabled.

**0.6. Point an external uptime monitor at a real `/e/<code>` page**, not `/api/health` alone —
that's the page an actual customer's QR sticker resolves to, so it catches things `/api/health`
can miss (a bad deploy that only breaks the scan page, a CDN issue, etc.). Any monitor works
(UptimeRobot, Better Uptime, Pingdom...); point the alert at the founder's phone (SMS or push),
not an inbox that might sit unread for hours.
**Verify:** trigger the monitor's test-alert feature (most have one) and confirm the phone alert
actually arrives.

**0.7. Set the 4 owner-plan Stripe price env vars** — `STRIPE_PRICE_SITE_MONTHLY`,
`STRIPE_PRICE_SITE_YEARLY`, `STRIPE_PRICE_MULTI_SITE_MONTHLY`, `STRIPE_PRICE_MULTI_SITE_YEARLY`
(the Kitchen / Multi-kitchen plans, `docs/BILLING.md` §6) — alongside the 6 provider-plan prices
in step 2 below. Easy to miss: an `equipment_owner`-kind signup doesn't fail loudly if these are
unset, since `getStripePriceId()` only throws when someone actually tries to check out on the
missing plan — which could be days after launch, on a real prospect's card attempt.
**Verify:** as an `equipment_owner`-kind test company, Settings → Billing → upgrade to Kitchen
(or Multi-kitchen) completes Stripe checkout without a "not configured" error.

---

## 1. Run the database migrations (15 min)

Supabase → SQL Editor → run every file in `supabase/migrations/` you haven't already applied,
**in order**: `0001_init.sql` through `0026_owner_security_review.sql` — 23 files (`0014` and
`0016` were never created; that's not a gap, just unused numbers from earlier drafts). If this is
a brand-new Supabase project, that's all 23; if you're updating a project that already ran an
earlier batch, just continue from wherever you left off — the file numbering is the run order.
See README.md's "Local setup" step 2 for the mechanics (SQL Editor vs. `supabase db push`).

If `0007_billing.sql` hasn't already run in your project, every existing company gets a fresh
14-day trial the moment it does (that includes your own account — put yourself on a plan
afterwards from Billing, or just leave the trial running while you test).

**Verify:** run `select count(*) from plan_limits;` — you should see 6 rows (3 provider plans:
starter/pro/business, and 3 owner-kind plans: free/site/multi_site).

## 2. Stripe (30 min)

Follow `docs/BILLING.md` exactly — start in **test mode**. Fastest path: run
`STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs`, which creates both plan sets'
products and prices (6 provider + 4 owner), the webhook endpoint, and both Customer Portal
configurations in one pass, and prints every env var it touched. Otherwise, by hand:

1. Create 5 products — Starter / Pro / Business (provider) and Kitchen / Multi-kitchen (owner,
   `docs/BILLING.md` §6) — each with a monthly and yearly recurring price. Copy the 10
   `price_...` ids into the matching `STRIPE_PRICE_*` vars.
2. Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook`, subscribe to
   the events listed in `docs/BILLING.md` §3, copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal → create **two** configurations (`docs/BILLING.md` §4):
   one holding the 6 provider prices (usually the account default), one holding the 4 owner
   prices. Copy their ids into `STRIPE_PORTAL_CONFIG_PROVIDER` / `STRIPE_PORTAL_CONFIG_OWNER` —
   both are optional (Stripe falls back to one default config for every company if unset), but a
   company that lands on the wrong plan set's config sees the wrong "Switch plan" list there.
4. Put all of the above into `.env.local` (local testing) and into Vercel (step 4 below).

**Verify:** as a provider-kind test company, Dashboard → Billing → "Upgrade" on any plan → Stripe
test checkout → pay with `4242 4242 4242 4242` → you land back on Billing showing the plan as
active, and "Manage billing" opens the portal. Repeat as an owner-kind test company against
Kitchen/Multi-kitchen (this doubles as Gate 0.7's check). Once both pass, repeat all four steps
in **live mode** with live keys.

## 3. Resend and Supabase Auth email

Done above, in Gate 0.1–0.3 — domain verification, switching off Supabase's default mailer, and
the end-to-end test with a non-team address. Nothing further here; the step number is kept so it
still lines up with anything written against an earlier version of this checklist.

## 4. Vercel — environment variables + cron (15 min)

The project should already be linked to Vercel (or run `vercel link`). In Vercel → Project →
Settings → Environment Variables, set every variable from `.env.local.example` for Production
(and Preview too, if you want preview deploys fully working). The ones most likely to trip you
up:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://equipqr.co` (QR codes and every email link embed this) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — required (Stripe webhook, notification emails, rate limiting, outbound webhooks, `/api/v1/*`) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Gate 0 — `EquipQR <notify@equipqr.co>` |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `STRIPE_*` (14 vars: secret key, webhook secret, 10 prices, 2 portal configs) | step 2 |
| `CRON_SECRET` | any long random string — `openssl rand -hex 32` |
| `ENV_GUARD_ENFORCE` | optional — `true` makes a misconfigured prod deploy fail startup instead of just logging; see README "Operations" |
| `NEXT_PUBLIC_FEATURE_BATCH_QR` | optional — defaults to `true` (on); set `false` only to keep pre-printed sticker batches parked, see `docs/BATCH-QR.md` |
| `SENTRY_DSN` | optional — see step 6 |

`vercel.json` schedules all 5 crons — `trial-reminders` (13:00 UTC), `visit-reminders`
(14:00 UTC), `pm-due` (12:00 UTC), `webhooks` (every 5 minutes), `dispatch-sla` (hourly). Vercel
picks them up on deploy and sends `CRON_SECRET` automatically. **This needs Vercel Pro** — see
Gate 0.5.

Then push `main` to GitHub — Vercel deploys it, and GitHub Actions (`.github/workflows/ci.yml`)
runs lint, typecheck, unit tests, build, and browser smoke tests on every push.
`.github/workflows/db-smoke.yml` separately applies every migration to a throwaway database and
runs the SQL assertion suites, so a migration that doesn't apply cleanly (or breaks RLS/RPC
behavior) fails CI instead of failing on your production database.

**Verify:** `https://equipqr.co/api/health` returns `{"ok":true,...}`, and
`https://equipqr.co/api/health?deep=1` with header `Authorization: Bearer <CRON_SECRET>` returns
`"productionReady": true`.

## 5. Supabase auth settings (5 min) — only if not already done

- Authentication → URL Configuration: Site URL = `https://equipqr.co`; add
  `https://equipqr.co/**` to Redirect URLs (and any preview-deployment domains you use).
- Authentication → Email Templates: the confirm-signup template must link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (see README §Deploying).
  If your current signups already work in production, this is done.

## 6. Optional but recommended

- **Sentry** (error alerts, free tier): create a Next.js project at sentry.io, set `SENTRY_DSN`
  (and `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` in Vercel for source maps). The app
  ignores Sentry completely when `SENTRY_DSN` is unset — including the production env guard's
  `captureMessage` call (step 4 / `src/lib/env.ts`), which just skips reporting in that case.
- **Legal review:** `/terms` and `/privacy` are solid starting text but say so in-page — have a
  lawyer glance at them before you take money.

(Supabase backups moved to Gate 0.4 above — that one isn't optional anymore.)

## 7. Smoke test the whole loop (20 min)

1. Sign up a brand-new **provider**-kind company in an incognito window → confirm email → land
   on the dashboard with the Getting-started checklist and the trial banner.
2. Create an equipment type → "Draft a guide with AI" → accept → add equipment → print the label.
3. Scan the QR with your phone → walk the guide → submit a service request with a photo → the
   notification email arrives with the AI summary → close it out from the dashboard → the
   customer gets the resolution email.
4. Settings → Team → invite a second email → accept as a technician → confirm they only see
   **Account** under Settings (Team, Billing, and the Settings root are all owner-only, and every
   other Settings tab is hidden from them too) and can't reach `/dashboard/settings/team` by URL.
5. On a phone-width screen, confirm the header shows a scan button and an Account icon-link, and
   that Sign out — now reachable from Settings → Account for every role — still works for the
   technician you just created.
6. Settings → Billing → upgrade (test mode) → confirm usage bars and plan name update.
7. Sign up a second brand-new company, this time **owner**-kind (`/signup?kind=owner`) → confirm
   it's never shown a locked screen, and Billing shows the Free plan as current with no checkout
   button until you upgrade it (upgrading it is Gate 0.7's check).

When all seven pass, flip Stripe to live keys — both plan sets — and you're open for business.

---

## What changed since the original launch build (for your own reference)

- **Billing:** two plan sets now — 3 provider plans and 3 owner-kind plans (Free / Kitchen /
  Multi-kitchen), each with its own Stripe Customer Portal configuration; owner-kind companies
  are never locked, just capped at their plan's equipment/location limits.
- **Teams:** email invitations, member management, owner / manager / technician roles in UI and
  RLS; the Settings subnav (not just the main sidebar) now hides every non-Account tab from
  non-owners, and deletes (equipment types, guides, customers, locations, vendors) are
  owner-only end to end.
- **Marketing site:** `/`, `/features`, `/pricing` (segmented by audience), `/faq`, `/about`,
  `/contact`, `/security`, `/restaurants`, `/terms`, `/privacy`, OG image, sitemap, robots.
- **Product:** getting-started checklist, owner-kind dashboard vocabulary / locations / vendor
  contact cards, pre-printed QR sticker batches (self-serve and platform-admin, on by default —
  `docs/BATCH-QR.md`), scan-to-onboard nameplate photos, custom equipment fields, outbound
  webhooks + CSV export + a public v1 API (Business plan), a role-aware app shell (ordered nav,
  a live Requests badge, mobile scan + account access).
- **Reliability:** typed env validation; a report-only production env guard that logs (and, with
  `ENV_GUARD_ENFORCE=true`, fails startup) when a required var is missing or misconfigured in
  production; `/api/health` plus an authenticated `/api/health?deep=1`; constant-time comparisons
  on the cron and deep-health-check secrets; Sentry (opt-in); an expanded unit test suite and
  browser smoke tests; a dedicated CI job that applies every migration to a throwaway database
  and runs SQL assertion suites (`db-smoke.yml`) alongside the existing lint/typecheck/build/e2e
  CI; a migrations-append-only check; README/RUNBOOK/BILLING/TEAMS/API/BATCH-QR docs kept current.
- **Fixed along the way:** an open redirect in the email-confirmation route, fonts silently
  falling back to Times New Roman (a circular CSS token), Google Fonts fetched at build time, a
  dead `FEATURES.ownerAccounts` flag removed, and the platform-admin console decoupled from the
  batch-QR feature flag so a future admin tool that has nothing to do with batch QR won't
  silently inherit that gate.
