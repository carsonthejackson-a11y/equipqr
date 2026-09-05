#!/usr/bin/env node
// One-shot Stripe setup for EquipQR. Idempotent — safe to re-run.
//
// Creates (or finds) the 3 products × 2 recurring prices from docs/BILLING.md,
// the webhook endpoint, and the Customer Portal configuration, then prints the
// env vars to paste into .env.local / Vercel.
//
// Usage (from the repo root):
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
//
// Optional:
//   APP_URL=https://equipqr.co   (default; used for the webhook URL + portal links)
//   --recreate-webhook           delete + recreate the webhook so a fresh signing
//                                secret is printed (Stripe only shows it once)
//
// Test vs live is decided by the key prefix. Run it once with each.

import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY || !/^sk_(test|live)_/.test(KEY)) {
  console.error("Set STRIPE_SECRET_KEY to an sk_test_... or sk_live_... key first.");
  process.exit(1);
}
const MODE = KEY.startsWith("sk_live_") ? "LIVE" : "TEST";
const APP_URL = (process.env.APP_URL ?? "https://equipqr.co").replace(/\/+$/, "");
const RECREATE_WEBHOOK = process.argv.includes("--recreate-webhook");

const stripe = new Stripe(KEY);

// Fail fast with a readable message if the key is wrong, instead of a stack dump.
try {
  await stripe.balance.retrieve();
} catch (err) {
  if (err?.type === "StripeAuthenticationError") {
    console.error(
      `\nStripe rejected this key (${KEY.slice(0, 8)}…${KEY.slice(-4)}, ${KEY.length} chars).\n` +
        `Secret keys are normally 107 chars. Check the last four characters against\n` +
        `Developers → API keys in the dashboard, or create a fresh secret key and copy it\n` +
        `with the copy button. Tip: put it in .env.local and run\n` +
        `  node --env-file=.env.local scripts/stripe-setup.mjs\n`
    );
    process.exit(1);
  }
  throw err;
}

// Keep in sync with src/lib/plans.ts and supabase/migrations/0007_billing.sql.
const PLANS = [
  { id: "starter", name: "EquipQR Starter", monthly: 29, yearly: 290, blurb: "Up to 50 units, 2 team members" },
  { id: "pro", name: "EquipQR Pro", monthly: 79, yearly: 790, blurb: "Up to 300 units, 10 team members, AI chat, branding" },
  { id: "business", name: "EquipQR Business", monthly: 199, yearly: 1990, blurb: "Up to 1,500 units, unlimited team, export & API" },
];

// Must match src/app/api/stripe/webhook/route.ts.
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

const envOut = {};
const log = (m) => console.log(`  ${m}`);

console.log(`\nStripe setup — ${MODE} mode — app URL ${APP_URL}\n`);

// ---------------------------------------------------------------------------
// 1. Products + prices (idempotent via price lookup_key + product metadata)
// ---------------------------------------------------------------------------
console.log("1. Products & prices");

async function findProduct(planId) {
  let startingAfter;
  for (;;) {
    const page = await stripe.products.list({ active: true, limit: 100, starting_after: startingAfter });
    const hit = page.data.find((p) => p.metadata?.equipqr_plan === planId);
    if (hit) return hit;
    if (!page.has_more) return null;
    startingAfter = page.data.at(-1).id;
  }
}

async function ensurePrice(product, planId, interval, dollars) {
  const lookupKey = `equipqr_${planId}_${interval}`;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    const p = existing.data[0];
    const ok =
      p.product === product.id &&
      p.unit_amount === dollars * 100 &&
      p.currency === "usd" &&
      p.recurring?.interval === interval;
    if (!ok) {
      console.error(
        `  !! price ${p.id} (lookup_key ${lookupKey}) exists but doesn't match $${dollars}/${interval} on ${product.id}.\n` +
          `     Fix or archive it in the dashboard, then re-run.`
      );
      process.exit(1);
    }
    log(`found   ${lookupKey.padEnd(26)} ${p.id}  $${dollars}/${interval}`);
    return p;
  }
  const p = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: dollars * 100,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname: `${product.name} — ${interval === "month" ? "monthly" : "yearly"}`,
    metadata: { equipqr_plan: planId, equipqr_interval: interval },
  });
  log(`created ${lookupKey.padEnd(26)} ${p.id}  $${dollars}/${interval}`);
  return p;
}

const priceIds = []; // for the portal config
for (const plan of PLANS) {
  let product = await findProduct(plan.id);
  if (product) {
    log(`found   product ${plan.id.padEnd(9)} ${product.id}`);
  } else {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.blurb,
      metadata: { equipqr_plan: plan.id },
    });
    log(`created product ${plan.id.padEnd(9)} ${product.id}`);
  }
  const monthly = await ensurePrice(product, plan.id, "month", plan.monthly);
  const yearly = await ensurePrice(product, plan.id, "year", plan.yearly);
  priceIds.push({ product: product.id, prices: [monthly.id, yearly.id] });
  envOut[`STRIPE_PRICE_${plan.id.toUpperCase()}_MONTHLY`] = monthly.id;
  envOut[`STRIPE_PRICE_${plan.id.toUpperCase()}_YEARLY`] = yearly.id;
}

// ---------------------------------------------------------------------------
// 2. Webhook endpoint
// ---------------------------------------------------------------------------
console.log("\n2. Webhook endpoint");
const webhookUrl = `${APP_URL}/api/stripe/webhook`;
const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
let hook = hooks.data.find((h) => h.url === webhookUrl);

if (hook && RECREATE_WEBHOOK) {
  await stripe.webhookEndpoints.del(hook.id);
  log(`deleted ${hook.id} (--recreate-webhook)`);
  hook = null;
}

let webhookSecretNote;
if (hook) {
  const missing = WEBHOOK_EVENTS.filter((e) => !hook.enabled_events.includes(e) && !hook.enabled_events.includes("*"));
  if (missing.length) {
    hook = await stripe.webhookEndpoints.update(hook.id, {
      enabled_events: [...new Set([...hook.enabled_events, ...WEBHOOK_EVENTS])],
    });
    log(`updated ${hook.id} — added events: ${missing.join(", ")}`);
  } else {
    log(`found   ${hook.id} (${hook.status}) — events already correct`);
  }
  webhookSecretNote =
    `existing endpoint — Stripe only reveals the signing secret once. Either copy it from\n` +
    `  #   https://dashboard.stripe.com/${MODE === "TEST" ? "test/" : ""}workbench/webhooks/${hook.id}\n` +
    `  #   or re-run with --recreate-webhook to get a fresh one printed here.`;
  // Deliberately not added to envOut: a "<see note above>" placeholder in an
  // otherwise paste-ready block is the kind of thing that ends up pasted.
} else {
  hook = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
    description: "EquipQR subscriptions sync",
    metadata: { equipqr: "true" },
  });
  log(`created ${hook.id} → ${webhookUrl}`);
  envOut.STRIPE_WEBHOOK_SECRET = hook.secret;
}

// ---------------------------------------------------------------------------
// 3. Customer Portal (the app uses the account's DEFAULT configuration)
// ---------------------------------------------------------------------------
console.log("\n3. Customer portal");
const portalParams = {
  business_profile: {
    headline: "Manage your EquipQR subscription",
    privacy_policy_url: `${APP_URL}/privacy`,
    terms_of_service_url: `${APP_URL}/terms`,
  },
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "address", "name"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      cancellation_reason: {
        enabled: true,
        options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products: priceIds,
    },
  },
  default_return_url: `${APP_URL}/dashboard/settings/billing`,
  metadata: { equipqr: "true" },
};

const defaults = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
let portal;
if (defaults.data[0]) {
  portal = await stripe.billingPortal.configurations.update(defaults.data[0].id, portalParams);
  log(`updated default configuration ${portal.id}`);
} else {
  portal = await stripe.billingPortal.configurations.create(portalParams);
  log(`created configuration ${portal.id} (becomes the default)`);
}

// ---------------------------------------------------------------------------
// 4. Output
// ---------------------------------------------------------------------------
console.log(`\n4. Env vars (${MODE}) — paste into .env.local and Vercel:\n`);
console.log(`STRIPE_SECRET_KEY=${KEY.slice(0, 12)}…  # the key you just used`);
if (webhookSecretNote) console.log(`# STRIPE_WEBHOOK_SECRET: ${webhookSecretNote}`);
for (const [k, v] of Object.entries(envOut)) console.log(`${k}=${v}`);
console.log(
  `\nNext: ${
    MODE === "TEST"
      ? "Dashboard → Billing → Upgrade → pay with 4242 4242 4242 4242, then re-run this with your sk_live_ key."
      : "you're on live keys — do one real checkout with your own card and refund it from the dashboard."
  }\n`
);
