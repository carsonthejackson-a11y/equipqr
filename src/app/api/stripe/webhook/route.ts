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
  return (KNOWN_STATUSES as readonly string[]).includes(status)
    ? (status as DbSubscriptionStatus)
    : "canceled";
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

async function upsertSubscription(
  subscription: Stripe.Subscription,
  admin: ReturnType<typeof createAdminClient>
) {
  const companyId = await resolveCompanyId(subscription, admin);
  if (!companyId) {
    console.error(
      `Stripe webhook: could not resolve a company for subscription ${subscription.id} (customer ${
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
      })`
    );
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const planInfo = priceId ? planFromStripePriceId(priceId) : null;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { error } = await admin.from("subscriptions").upsert(
    {
      company_id: companyId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_id: planInfo?.planId ?? null,
      interval: planInfo?.interval ?? null,
      status: mapStatus(subscription.status),
      current_period_end: isoOrNull(item?.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_ends_at: isoOrNull(subscription.trial_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (error) {
    console.error(`Stripe webhook: failed to upsert subscription for company ${companyId}:`, error.message);
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
          await upsertSubscription(subscription, admin);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscription(subscription, admin);
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
          await upsertSubscription(subscription, admin);
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
