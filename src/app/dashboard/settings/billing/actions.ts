"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getStripePriceId, isPlanId, type BillingInterval, type PlanId } from "@/lib/plans";

type OwnerCompanyResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; company: OwnerCompany }
  | { ok: false; error: string };

type OwnerCompany = {
  id: string;
  name: string;
  notification_email: string;
  stripe_customer_id: string | null;
};

async function requireOwnerCompany(): Promise<OwnerCompanyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { ok: false, error: "No company found for this account" };
  }
  if (profile.role !== "owner") {
    return { ok: false, error: "Only the account owner can manage billing" };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, notification_email, stripe_customer_id")
    .eq("id", profile.company_id)
    .maybeSingle<OwnerCompany>();

  if (!company) {
    return { ok: false, error: "No company found for this account" };
  }

  return { ok: true, supabase, company };
}

function appUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }
  return url.replace(/\/$/, "");
}

export async function createCheckoutSession(planId: string, interval: string) {
  if (!isStripeConfigured()) {
    return { error: "Stripe is not configured in this environment yet." };
  }
  if (!isPlanId(planId) || (interval !== "month" && interval !== "year")) {
    return { error: "Invalid plan selection" };
  }

  const auth = await requireOwnerCompany();
  if (!auth.ok) {
    return { error: auth.error };
  }
  const { supabase, company } = auth;

  let priceId: string;
  let base: string;
  try {
    priceId = getStripePriceId(planId as PlanId, interval as BillingInterval);
    base = appUrl();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Billing is not fully configured" };
  }

  const stripe = getStripe();
  let customerId = company.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: company.name,
      email: company.notification_email,
      metadata: { company_id: company.id },
    });
    customerId = customer.id;

    const { error: updateError } = await supabase
      .from("companies")
      .update({ stripe_customer_id: customerId })
      .eq("id", company.id);

    if (updateError) {
      return { error: `Could not save Stripe customer: ${updateError.message}` };
    }
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${base}/dashboard/settings/billing?success=1`,
      cancel_url: `${base}/dashboard/settings/billing?canceled=1`,
      client_reference_id: company.id,
      subscription_data: { metadata: { company_id: company.id } },
      metadata: { company_id: company.id, plan_id: planId, interval },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout" };
  }

  if (!session.url) {
    return { error: "Could not start checkout" };
  }

  redirect(session.url);
}

export async function createPortalSession() {
  if (!isStripeConfigured()) {
    return { error: "Stripe is not configured in this environment yet." };
  }

  const auth = await requireOwnerCompany();
  if (!auth.ok) {
    return { error: auth.error };
  }
  const { company } = auth;

  if (!company.stripe_customer_id) {
    return { error: "No billing account yet — choose a plan first." };
  }

  let base: string;
  try {
    base = appUrl();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Billing is not fully configured" };
  }

  const stripe = getStripe();
  let portalSession;
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${base}/dashboard/settings/billing`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the billing portal" };
  }

  redirect(portalSession.url);
}
