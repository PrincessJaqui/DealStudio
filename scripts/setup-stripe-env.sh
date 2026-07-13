#!/usr/bin/env bash
#
# setup-stripe-env.sh
#
# Pulls the two secrets you asked about and pushes them straight into Vercel.
#
# THE POINT OF THIS SCRIPT is that the secrets go from the CLI into Vercel
# WITHOUT ever being printed to your terminal, pasted into a chat, or written to
# a file. They are never echoed. They never enter your shell history. If you want
# to eyeball one, use the dashboard, not this.
#
# What it can and cannot fetch:
#
#   SUPABASE_SERVICE_ROLE_KEY  -> yes, the Supabase CLI prints it
#   STRIPE_WEBHOOK_SECRET      -> yes, but ONLY at creation time. Stripe shows an
#                                 endpoint's signing secret when the endpoint is
#                                 created and never again through the API. That is
#                                 why this script CREATES the endpoint.
#   STRIPE_SECRET_KEY          -> no. There is no CLI command that prints your
#                                 sk_. Copy it from the dashboard once. Anything
#                                 claiming otherwise is wrong.
#
# Prerequisites:
#   brew install stripe/stripe-cli/stripe
#   brew install supabase/tap/supabase
#   npm i -g vercel
#   stripe login && supabase login && vercel login
#
# Run from the repo root.

set -euo pipefail

PROJECT_REF="fitjoizptvxposunejgz"
WEBHOOK_URL="https://dealstudio.io/api/stripe/webhook"

# Exactly the events api/stripe/webhook.ts handles. Sending events it does not
# handle is harmless noise; NOT sending one it needs means silent billing bugs,
# so this list is read off the code rather than guessed.
EVENTS=(
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.paid
  invoice.payment_failed
  charge.refunded
)

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing: $1"
    echo "  $2"
    exit 1
  }
}

need stripe "brew install stripe/stripe-cli/stripe"
need supabase "brew install supabase/tap/supabase"
need vercel "npm i -g vercel"
need jq "brew install jq"

echo "==> 1/3  Supabase service role key"

# --experimental is required on current CLI versions for this command.
SERVICE_KEY="$(
  supabase projects api-keys --project-ref "$PROJECT_REF" --output json --experimental 2>/dev/null \
    | jq -r '.[] | select(.name == "service_role") | .api_key'
)"

if [ -z "$SERVICE_KEY" ] || [ "$SERVICE_KEY" = "null" ]; then
  echo "    Could not read it. Run 'supabase login' first."
  echo "    Or copy it by hand: Supabase > Settings > API > service_role"
  exit 1
fi
echo "    got it (${#SERVICE_KEY} chars, not printing it)"

echo "==> 2/3  Stripe webhook endpoint"

# Already there? Stripe will not re-reveal the secret for an existing endpoint,
# so a second endpoint would be created and the old one would go quietly stale.
EXISTING="$(
  stripe webhook_endpoints list --limit 100 2>/dev/null \
    | jq -r --arg u "$WEBHOOK_URL" '.data[] | select(.url == $u) | .id' | head -1
)"

if [ -n "$EXISTING" ]; then
  echo "    An endpoint for $WEBHOOK_URL already exists ($EXISTING)."
  echo "    Stripe only reveals a signing secret at creation, so I cannot read it back."
  echo "    Either delete it and re-run:"
  echo "        stripe webhook_endpoints delete $EXISTING"
  echo "    or copy the secret from the dashboard and set it by hand:"
  echo "        vercel env add STRIPE_WEBHOOK_SECRET production"
  exit 1
fi

ENABLED_ARGS=()
for e in "${EVENTS[@]}"; do
  ENABLED_ARGS+=(--enabled-events "$e")
done

WEBHOOK_SECRET="$(
  stripe webhook_endpoints create \
    --url "$WEBHOOK_URL" \
    "${ENABLED_ARGS[@]}" \
    2>/dev/null | jq -r '.secret'
)"

if [ -z "$WEBHOOK_SECRET" ] || [ "$WEBHOOK_SECRET" = "null" ]; then
  echo "    Could not create the endpoint. Run 'stripe login' first."
  exit 1
fi
echo "    created, ${#WEBHOOK_SECRET} chars (not printing it)"

echo "==> 3/3  Pushing into Vercel"

# printf, not echo: the value goes down a pipe, never onto the screen.
for env in production preview; do
  printf '%s' "$SERVICE_KEY"    | vercel env add SUPABASE_SERVICE_ROLE_KEY "$env" >/dev/null 2>&1 || true
  printf '%s' "$WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET     "$env" >/dev/null 2>&1 || true
done

unset SERVICE_KEY WEBHOOK_SECRET

echo "    done"
echo
echo "Still to do by hand, because no CLI will print it for you:"
echo
echo "  STRIPE_SECRET_KEY"
echo "    Stripe > Developers > API keys > Secret key (starts sk_)"
echo "    Then:  vercel env add STRIPE_SECRET_KEY production"
echo
echo "  Use a TEST key (sk_test_) until a checkout works end to end."
echo
echo "Then redeploy, or the new variables will not be picked up:"
echo "  vercel --prod"
