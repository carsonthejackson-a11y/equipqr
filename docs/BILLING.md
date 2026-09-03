# Billing setup (Stripe)

EquipQR sells three plans (Starter / Pro / Business, monthly or yearly) via Stripe Checkout +
Customer Portal. Plan data (pricing, limits, feature flags) lives in `src/lib/plans.ts` — that
file is the single source of truth; everything else (the DB's `plan_limits` reference table,
the billing page, the Stripe products you create) should match it.

## 1. Create products & prices in the Stripe dashboard

For each plan in `src/lib/plans.ts`, create one Product with two recurring Prices (monthly and
yearly), in USD, matching `priceMonthly`/`priceYearly`:

| Plan     | Monthly | Yearly |
|----------|---------|--------|
| Starter  | $29     | $290   |
| Pro      | $79     | $790   |
| Business | $199    | $1990  |

Copy each price's id (`price_...`) into the matching env var (see `.env.local.example`):

```
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...
```

`src/lib/plans.ts`'s `getStripePriceId()` reads these at request time and throws a clear error
if one is missing, so checkout for a specific plan/interval will fail loudly rather than
silently if you forget one.

## 2. Set the two other Stripe keys

- `STRIPE_SECRET_KEY` — from Developers → API keys.
- `STRIPE_WEBHOOK_SECRET` — created in step 3 below.

Without `STRIPE_SECRET_KEY` set, the app degrades gracefully: the billing page shows a "Stripe
not configured" note, checkout/portal buttons are disabled, and the webhook route returns 503.
Everything else (trial countdown, equipment limits, the locked screen) keeps working off the
`companies.trial_ends_at` column alone.

## 3. Webhook endpoint

In the Stripe dashboard → Developers → Webhooks, add an endpoint pointing at:

```
https://<your-deployed-domain>/api/stripe/webhook
```

Subscribe it to these events (this is exactly what `src/app/api/stripe/webhook/route.ts`
handles):

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`. Locally, use the Stripe CLI
(`stripe listen --forward-to localhost:3000/api/stripe/webhook`) which prints a matching
`whsec_...` secret for local testing.

The webhook upserts one row per company into the `subscriptions` table (keyed by
`company_id`, so re-delivery of the same event is a no-op update, not a duplicate row) using
`src/lib/supabase/admin.ts` — a service-role client that bypasses RLS, since clients are never
allowed to write to `subscriptions` directly (see the RLS policy in
`supabase/migrations/0007_billing.sql`).

## 4. Enable the Customer Portal

In the Stripe dashboard → Settings → Billing → Customer portal, enable it and turn on:
- Update payment method
- Cancel subscription
- Switch plans (add all 6 prices from step 1 so customers can self-serve switch plans there too,
  though the app's own "Switch plan" buttons on `/dashboard/settings/billing` cover this via
  Checkout as well)
- Invoice history

"Manage billing" on the billing page opens this portal for the company's Stripe customer.

## 5. How the trial → locked flow works

- A new company gets `companies.trial_ends_at = now() + 14 days` at signup (see
  `create_company_and_profile` in `supabase/migrations/0007_billing.sql`, and `TRIAL_DAYS` /
  `TRIAL_PLAN` in `src/lib/plans.ts` — currently 14 days on the Pro plan's features/limits).
- `get_company_entitlements()` (a Postgres RPC, called from `src/lib/billing.ts`'s
  `getEntitlements()`) computes, per request, whether the company is:
  - **trialing** — `trial_ends_at` is in the future and there's no active paid subscription yet.
    Trialing companies get `TRIAL_PLAN`'s (Pro) features and limits.
  - **active** — a Stripe subscription with `status = 'active'` exists. Uses that subscription's
    actual plan (mapped from the Stripe price id via `planFromStripePriceId()`).
  - **locked** — the trial has ended and there's no active/trialing subscription. Any other
    Stripe status (`past_due`, `canceled`, `incomplete`, `unpaid`, `paused`) counts as "not
    active" for this purpose.
- `src/app/dashboard/layout.tsx` calls `getEntitlements()` on every dashboard request. If
  `is_locked` and the current route isn't under `/dashboard/settings/billing`, it renders
  `src/components/billing/locked-screen.tsx` instead of the page content (the sidebar/nav still
  render, so the owner can reach Billing to fix it). While trialing, a slim
  `src/components/billing/trial-banner.tsx` shows the days remaining above the page content.
- **The public QR scan flow (`/e/[qrToken]`) is never locked or blocked by billing status** —
  customers should always be able to scan a code and see the troubleshooting guide. The only
  billing-driven behavior there is that the AI chat input silently doesn't render (falls back to
  tap-only options) if the company's plan doesn't include the `aiChat` feature — see
  `get_company_plan_flags()` and `getCompanyPlanFlags()` in `src/lib/billing.ts`.
- The equipment limit is enforced twice: in the `createEquipment` server action (via
  `assertCanAddEquipment()`, for a friendly inline error) and again as a Postgres `before insert`
  trigger on `equipment` (`enforce_equipment_limit()`), reading from the `plan_limits` table as a
  backstop against any other insert path.
