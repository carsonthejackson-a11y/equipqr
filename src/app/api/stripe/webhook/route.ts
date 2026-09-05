import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFromStripePriceId } from "@/lib/plans";

// Raw-body signature verification requires the Node.js runtime (the Edge
// runtime doesn't give us the exact bytes Stripe signed).
export const runtime = "nodejs";

type DbSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid"
  | "paused";

const KNOWN_STATUSES: readonly DbSubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
  "paused",
];

function mapStatus(status: Stripe.Subscription.Status): DbSubscriptionStatus {
  // Our `subscriptions.status` check constraint doesn't have a distinct
  // "incomplete_expired" state — an incomplete subscription whose first
  // invoice payment never succeeded in time is functionally canceled.
  if (status === "incomplete_expired") return "canceled";
  // Stripe's type also carries a forward-compatible catch-all string
  // (`OtherString`) for statuses that don't exist yet. Fall back to
  // "canceled" for anything outside our known set rather than letting an
  // unrecognized value violate the DB check constraint.
  if (!(KNOWN_STATUSES as readonly string[]).includes(status)) {
    console.warn(
      `Stripe webhook: unrecognized subscription status "${status}" — storing it as "canceled"`
    );
    return "canceled";
  }

  return status as DbSubscriptionStatus;
}

function isoOrNull(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

async function resolveCompanyId(
  subscription: Stripe.Subscription,
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const metaCompanyId = subscription.metadata?.company_id;
  if (metaCompanyId) return metaCompanyId;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { data } = await admin
    .from("companies")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

// PostgREST surfaces a Postgres foreign-key violation as code 23503. On
// `subscriptions.company_id` that means the company row is gone — which is
// exactly what a deleted account looks like, since deleteCompany() cancels
// its Stripe subscriptions and Stripe then sends us the resulting
// customer.subscription.deleted after the row no longer exists.
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Mirrors one Stripe subscription onto the company's `subscriptions` row.
 *
 * Throws on transient failures (DB/network errors) so POST() below answers
 * 500 and Stripe retries rather than losing the update behind a 200. Permanent
 * ones — no company to attach the subscription to, in either direction — are
 * logged and swallowed, because retrying them can only fail the same way.
 */
async function upsertSubscription(
  subscription: Stripe.Subscription,
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event
) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const companyId = await resolveCompanyId(subscription, admin);
  if (!companyId) {
    // Permanent: nothing to attach this to, now or on a retry. Usually a
    // deleted account, or a customer created outside this app entirely.
    console.error(
      `Stripe webhook: could not resolve a company for subscription ${subscription.id} (customer ${customerId}) — ignoring ${event.type}`
    );
    return;
  }

  // Stripe delivers events at-least-once and out of order, so an older
  // event replayed after a newer one must not overwrite current state.
  // `updated_at` holds the event time (not wall-clock now) precisely so the
  // two are comparable.
  const eventAt = new Date(event.created * 1000);

  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("updated_at, stripe_subscription_id")
    .eq("company_id", companyId)
    .maybeSingle<{ updated_at: string; stripe_subscription_id: string | null }>();

  if (existingError) {
    throw new Error(
      `failed to read the existing subscription for company ${companyId}: ${existingError.message}`
    );
  }

  if (existing && eventAt < new Date(existing.updated_at)) {
    console.warn(
      `Stripe webhook: skipping stale ${event.type} for company ${companyId} — event ${eventAt.toISOString()} is older than the stored row (${existing.updated_at}, subscription ${
        existing.stripe_subscription_id ?? "none"
      })`
    );
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const planInfo = priceId ? planFromStripePriceId(priceId) : null;

  if (priceId && !planInfo) {
    console.error(
      `Stripe webhook: price ${priceId} (subscription ${subscription.id}) doesn't match any configured STRIPE_PRICE_* env var — leaving plan_id/interval as they are`
    );
  }

  // An unmapped price must never null out a paying customer's plan: keep the
  // columns out of the payload entirely so the upsert leaves them untouched.
  // Only a brand-new row (nothing to preserve) falls back to nulls.
  const planColumns = planInfo
    ? { plan_id: planInfo.planId, interval: planInfo.interval }
    : existing
      ? {}
      : { plan_id: null, interval: null };

  const { error } = await admin.from("subscriptions").upsert(
    {
      company_id: companyId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      ...planColumns,
      status: mapStatus(subscription.status),
      current_period_end: isoOrNull(item?.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_ends_at: isoOrNull(subscription.trial_end),
      updated_at: eventAt.toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      // Permanent: the company was deleted between resolving it and writing.
      console.error(
        `Stripe webhook: company ${companyId} no longer exists — ignoring ${event.type} for subscription ${subscription.id}`
      );
      return;
    }
    throw new Error(`failed to upsert subscription for company ${companyId}: ${error.message}`);
  }

  // A subscription created outside our own Checkout (straight from the
  // Stripe dashboard, say) leaves companies.stripe_customer_id null, which
  // hides the "Manage billing" button and blocks createPortalSession().
  // Best-effort backfill — the subscription row is already saved, so a
  // failure here isn't worth a retry of the whole event.
  const { error: backfillError } = await admin
    .from("companies")
    .update({ stripe_customer_id: customerId })
    .eq("id", companyId)
    .is("stripe_customer_id", null);

  if (backfillError) {
    console.error(
      `Stripe webhook: failed to backfill stripe_customer_id for company ${companyId}:`,
      backfillError.message
    );
  }
}

export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscription(subscription, admin, event);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscription(subscription, admin, event);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subscriptionId) {
          // Re-fetch rather than hand-patch the status: Stripe has already
          // transitioned the subscription by the time this event fires, so
          // pulling the current object keeps us consistent with whatever
          // customer.subscription.updated also reports for the same change.
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertSubscription(subscription, admin, event);
        }
        break;
      }

      default:
        // Unhandled event type — ignore. Stripe expects a 2xx regardless.
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook: error handling ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
