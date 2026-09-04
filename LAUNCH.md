# EquipQR — launch checklist

Everything below is something only you can do (it needs your accounts, keys, or a credit card).
Work top to bottom; each step says how to verify it. Budget: about 90 minutes.

The detailed docs behind each step: `README.md` (setup/deploy), `docs/BILLING.md` (Stripe),
`docs/TEAMS.md` (invites/roles), `docs/EMAILS.md` (every email), `docs/RUNBOOK.md` (incidents),
`docs/BATCH-QR.md` (the parked pre-printed sticker feature and how to turn it back on).

---

## 1. Run the new database migrations (10 min)

Supabase → SQL Editor → paste and run **each file, in order**, one at a time:

1. `supabase/migrations/0007_billing.sql` — subscriptions, trials, plan limits, entitlements
2. `supabase/migrations/0008_team_invites.sql` — invitations, roles, tighter RLS
3. `supabase/migrations/0009_polish.sql` — scan analytics, welcome/trial-reminder tracking, delete-company
4. `supabase/migrations/0010_drop_stale_overload.sql` — removes a leftover duplicate function

Every existing company gets a fresh 14-day trial starting the moment 0007 runs (that includes
your own account — you can put yourself on a plan afterwards from Billing, or just leave the
trial running while you test).

**Verify:** run `select * from plan_limits;` — you should see 3 rows (starter / pro / business).

## 2. Stripe (25 min)

Follow `docs/BILLING.md` exactly. In short, in the Stripe dashboard (start in **test mode**):

1. Create 3 products — Starter, Pro, Business — each with a **monthly** and a **yearly**
   recurring price: $29/$290, $79/$790, $199/$1,990. Copy the six `price_...` ids.
2. Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook`, subscribe to
   the events listed in `docs/BILLING.md` §3, copy the signing secret.
3. Settings → Billing → Customer portal → enable it (allow plan switching + cancellation).
4. Put `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the six `STRIPE_PRICE_*` values into
   `.env.local` (for local testing) and into Vercel (step 4).

**Verify:** Dashboard → Billing → "Upgrade" on any plan → Stripe test checkout → pay with
`4242 4242 4242 4242` → you land back on Billing showing the plan as active. Then "Manage billing"
opens the portal. When that works, repeat the four steps in **live mode** with live keys.

## 3. Resend — real email domain (10 min)

Right now emails only deliver to the address you signed up to Resend with. In Resend → Domains,
add the domain you'll send from (e.g. `equipqr.app`), add the DNS records it gives you, wait for
"Verified", then set `RESEND_FROM_EMAIL` to something like `EquipQR <notify@equipqr.app>`.

**Verify:** invite yourself from Settings → Team using a second email address — the invite
email should arrive.

## 4. Vercel — environment variables + cron (15 min)

The project is already linked to Vercel (`.vercel/project.json`). In Vercel → Project → Settings
→ Environment Variables, set every variable from `.env.local.example`. The ones that matter most:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | your production URL, e.g. `https://equipqr.app` (QR codes embed this) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **required now** (Stripe webhook + trial reminders use it) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | step 3 |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `STRIPE_*` (8 vars) | step 2 |
| `CRON_SECRET` | any long random string — `openssl rand -hex 32` |
| `NEXT_PUBLIC_FEATURE_BATCH_QR` | `false` (leave off for launch) |
| `SENTRY_DSN` | optional — see step 6 |

`vercel.json` already schedules the daily trial-reminder email at 13:00 UTC (8am Central);
Vercel picks it up on deploy and sends the `CRON_SECRET` automatically.

Then push `main` to GitHub — Vercel deploys it, and GitHub Actions (`.github/workflows/ci.yml`)
runs lint, typecheck, unit tests, build, and browser smoke tests on every push.

**Verify:** `https://<your-domain>/api/health` returns `{"ok":true,...}`.

## 5. Supabase auth settings (5 min) — only if not already done

- Authentication → URL Configuration: Site URL = your production URL; add
  `https://<your-domain>/**` to Redirect URLs.
- Authentication → Email Templates: the confirm-signup template must link to
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (see README §Deploying).
  If your current signups already work in production, this is done.

## 6. Optional but recommended

- **Sentry** (error alerts, free tier): create a Next.js project at sentry.io, set `SENTRY_DSN`
  (and `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` in Vercel for source maps). The app
  ignores Sentry completely when `SENTRY_DSN` is unset.
- **Legal review:** `/terms` and `/privacy` are solid starting text but say so in-page — have a
  lawyer glance at them before you take money.
- **Supabase backups:** Settings → Database → enable Point-in-Time Recovery once you have paying
  customers.

## 7. Smoke test the whole loop (15 min)

1. Sign up a brand-new company in an incognito window → confirm email → land on the dashboard
   with the Getting-started checklist and "trial ends in 14 days" banner.
2. Create an equipment type → "Draft a guide with AI" → accept → add equipment → print the label.
3. Scan the QR with your phone → walk the guide → submit a service request with a photo →
   the notification email arrives with the AI summary → close it out from the dashboard →
   the customer gets the resolution email.
4. Settings → Team → invite a second email → accept as a technician → confirm the technician
   can't see Billing/Team/Settings.
5. Settings → Billing → upgrade (test mode) → confirm usage bars and plan name update.

When all five pass, flip Stripe to live keys and you're open for business.

---

## What changed in this release (for your own reference)

- **Billing:** Stripe subscriptions (3 plans × monthly/yearly), 14-day Pro trial, trial banner,
  lock screen after trial, equipment + team-seat limits enforced in the app *and* in the database.
- **Teams:** email invitations, member management, owner/technician permissions in UI and RLS.
- **Marketing site:** `/`, `/features`, `/pricing`, `/faq`, `/about`, `/contact`, `/security`,
  `/terms`, `/privacy`, OG image, sitemap, robots.
- **Product:** getting-started checklist, richer overview (recent requests, monthly trend, scans),
  scan analytics, account settings (name/email/password), delete-company, unified email templates,
  welcome + trial-ending emails.
- **Reliability:** typed env validation, `/api/health`, Sentry (opt-in), 34 unit tests, 6 browser
  smoke tests, GitHub Actions CI, migrations-append-only check, full README/RUNBOOK.
- **Parked:** pre-printed sticker batches (`NEXT_PUBLIC_FEATURE_BATCH_QR=true` brings them back).
- **Fixed along the way:** an open redirect in the email-confirmation route, fonts silently falling
  back to Times New Roman (a circular CSS token), Google Fonts fetched at build time.
