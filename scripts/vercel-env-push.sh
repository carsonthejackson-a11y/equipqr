#!/usr/bin/env bash
# Push EquipQR's production environment variables to Vercel in one go.
#
#   STRIPE_SECRET_KEY=sk_test_... scripts/vercel-env-push.sh test   # rehearse checkout with 4242
#   STRIPE_SECRET_KEY=sk_live_... scripts/vercel-env-push.sh live   # open for business
#
# Reads:
#   .env.local                 Supabase / Anthropic / Resend values
#   .env.stripe-<mode>.local   STRIPE_PRICE_* + STRIPE_WEBHOOK_SECRET
#   $STRIPE_SECRET_KEY         the sk_test_/sk_live_ key for the chosen mode (passed inline)
#
# Needs the Vercel CLI logged in and this folder linked (.vercel/project.json exists).
# Secrets never leave your machine — this just wraps `vercel env add`.
# Re-runnable: each variable is removed and re-added, so it's always the current value.
# Works with the bash 3.2 that ships with macOS.

set -eu
cd "$(dirname "$0")/.."

MODE="${1:-}"
[ "$MODE" = "test" ] || [ "$MODE" = "live" ] || { echo "usage: $0 test|live"; exit 1; }

STRIPE_FILE=".env.stripe-$MODE.local"
[ -f .env.local ] || { echo ".env.local not found"; exit 1; }
[ -f "$STRIPE_FILE" ] || { echo "$STRIPE_FILE not found"; exit 1; }
[ -f .vercel/project.json ] || { echo "Not linked to Vercel — run: vercel link"; exit 1; }

if command -v vercel >/dev/null 2>&1; then VERCEL="vercel"; else VERCEL="npx --yes vercel@latest"; fi

case "${STRIPE_SECRET_KEY:-}" in
  sk_${MODE}_*) ;;
  *) echo "Set STRIPE_SECRET_KEY to an sk_${MODE}_... key, e.g.:"
     echo "  STRIPE_SECRET_KEY=sk_${MODE}_... $0 $MODE"; exit 1;;
esac

# Read one KEY=value from a dotenv file.
getenv() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- ; }

# Keep an existing CRON_SECRET across runs (file is gitignored via .env*).
if [ -f .env.cron-secret.local ]; then
  CRON_SECRET="$(cat .env.cron-secret.local)"
else
  CRON_SECRET="$(openssl rand -hex 32)"
  printf '%s' "$CRON_SECRET" > .env.cron-secret.local
fi

# KEY<TAB>VALUE, one per line.
VARS="$(cat <<EOF
NEXT_PUBLIC_SUPABASE_URL	$(getenv .env.local NEXT_PUBLIC_SUPABASE_URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY	$(getenv .env.local NEXT_PUBLIC_SUPABASE_ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY	$(getenv .env.local SUPABASE_SERVICE_ROLE_KEY)
ANTHROPIC_API_KEY	$(getenv .env.local ANTHROPIC_API_KEY)
RESEND_API_KEY	$(getenv .env.local RESEND_API_KEY)
RESEND_FROM_EMAIL	$(getenv .env.local RESEND_FROM_EMAIL)
NEXT_PUBLIC_APP_URL	https://equipqr.co
NEXT_PUBLIC_SUPPORT_EMAIL	support@equipqr.co
NEXT_PUBLIC_FEATURE_BATCH_QR	false
CRON_SECRET	$CRON_SECRET
STRIPE_SECRET_KEY	$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET	$(getenv "$STRIPE_FILE" STRIPE_WEBHOOK_SECRET)
STRIPE_PRICE_STARTER_MONTHLY	$(getenv "$STRIPE_FILE" STRIPE_PRICE_STARTER_MONTHLY)
STRIPE_PRICE_STARTER_YEARLY	$(getenv "$STRIPE_FILE" STRIPE_PRICE_STARTER_YEARLY)
STRIPE_PRICE_PRO_MONTHLY	$(getenv "$STRIPE_FILE" STRIPE_PRICE_PRO_MONTHLY)
STRIPE_PRICE_PRO_YEARLY	$(getenv "$STRIPE_FILE" STRIPE_PRICE_PRO_YEARLY)
STRIPE_PRICE_BUSINESS_MONTHLY	$(getenv "$STRIPE_FILE" STRIPE_PRICE_BUSINESS_MONTHLY)
STRIPE_PRICE_BUSINESS_YEARLY	$(getenv "$STRIPE_FILE" STRIPE_PRICE_BUSINESS_YEARLY)
EOF
)"

# Sanity checks before touching Vercel.
fail=0
while IFS="$(printf '\t')" read -r k v; do
  case "$v" in
    ""|*REPLACE_ME*) echo "  !! $k is empty or a placeholder"; fail=1;;
  esac
  [ "$k" = "STRIPE_WEBHOOK_SECRET" ] && case "$v" in whsec_*) ;; *) echo "  !! STRIPE_WEBHOOK_SECRET should start with whsec_"; fail=1;; esac
done <<EOF
$VARS
EOF
[ "$(getenv .env.local SUPABASE_SERVICE_ROLE_KEY)" != "$(getenv .env.local NEXT_PUBLIC_SUPABASE_ANON_KEY)" ] \
  || { echo "  !! service role key equals anon key"; fail=1; }
[ $fail -eq 0 ] || { echo "Fix the above and re-run."; exit 1; }

echo "Pushing variables to Vercel (production) — Stripe $MODE mode"
while IFS="$(printf '\t')" read -r k v; do
  $VERCEL env rm "$k" production --yes >/dev/null 2>&1 || true
  printf '%s' "$v" | $VERCEL env add "$k" production >/dev/null
  case "$k" in
    *SECRET*|*KEY*) echo "  set $k (hidden)";;
    *)              echo "  set $k = $v";;
  esac
done <<EOF
$VARS
EOF

echo
echo "Done. Variables apply to the NEXT deployment — push main, or redeploy from the Vercel dashboard."
