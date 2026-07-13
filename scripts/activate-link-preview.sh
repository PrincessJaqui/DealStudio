#!/usr/bin/env bash
#
# activate-link-preview.sh
#
# Turns on automatic article previews (title, description, image).
#
# This is NOT SQL. link-preview is a Deno edge function written in TypeScript,
# so pasting it into the Supabase SQL editor will always fail at `const CORS`.
# It has to be deployed to Edge Functions.
#
# The --no-verify-jwt flag is the part that actually fixes the CORS error.
# Supabase turns on JWT verification by default, and a browser NEVER sends an
# auth header on a CORS preflight, so the gateway rejects the preflight with a
# 401 before the function ever runs. That is the "does not have HTTP ok status"
# message in the console.
#
# Run this from the repo root.

set -euo pipefail

PROJECT_REF="fitjoizptvxposunejgz"
FUNC="link-preview"

if [ ! -f "supabase/functions/${FUNC}/index.ts" ]; then
  echo "Cannot find supabase/functions/${FUNC}/index.ts"
  echo "Run this from the DealStudio repo root."
  exit 1
fi

echo "==> Signing in to Supabase (opens a browser)"
npx --yes supabase login

echo
echo "==> Deploying ${FUNC} with JWT verification disabled"
npx --yes supabase functions deploy "${FUNC}" \
  --project-ref "${PROJECT_REF}" \
  --no-verify-jwt

echo
echo "Done."
echo
echo "Test it: open a deal, go to Industry Reading, paste an article link and tab out."
echo "The title, description and image should fill in on their own."
echo
echo "If it still fails, check Edge Functions > ${FUNC} > Settings and confirm"
echo "'Verify JWT' is OFF. That single toggle is the whole fix."
