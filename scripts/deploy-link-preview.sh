#!/usr/bin/env bash
#
# deploy-link-preview.sh
#
# Deploys the link-preview Edge Function with JWT verification OFF.
#
# WHY JWT MUST BE OFF
# The function is called from the browser on the public investor page, where
# there is no logged-in user and therefore no JWT. With verification on, Supabase
# rejects the browser's CORS preflight with a 401 before the function ever runs,
# so every article preview comes back blank. It is not a bug in the function.
#
# ABOUT THE SCRIPT SUPABASE'S AI GAVE YOU
# It very nearly works, but its awk block is broken: it builds the pattern
#   "^\[" section "\]$"
# while `section` is already '[functions.link-preview]' -- brackets included. So
# it searches for '[[functions.link-preview]]', never matches, and the "section
# already exists" branch silently does nothing. You would run it, see "Done.",
# and still have previews off.
#
# This version uses the --no-verify-jwt flag, which does the same job in one step
# and cannot half-apply. It also writes config.toml so the setting survives the
# next deploy from any machine.

set -euo pipefail

PROJECT_REF="fitjoizptvxposunejgz"
FN="link-preview"
CONFIG="supabase/config.toml"

command -v supabase >/dev/null 2>&1 || {
  echo "The Supabase CLI is not installed."
  echo "  brew install supabase/tap/supabase"
  exit 1
}

[ -d "supabase/functions/$FN" ] || {
  echo "Cannot find supabase/functions/$FN"
  echo "Run this from the repo root."
  exit 1
}

# Persist the setting, so a future `supabase functions deploy` from any machine
# does not quietly turn verification back on.
mkdir -p supabase
touch "$CONFIG"

if grep -q "^\[functions\.$FN\]" "$CONFIG" 2>/dev/null; then
  # Section exists: make sure verify_jwt inside it says false.
  python3 - "$CONFIG" "$FN" <<'PY'
import re, sys
path, fn = sys.argv[1], sys.argv[2]
src = open(path).read()
header = f"[functions.{fn}]"
i = src.index(header)
# The section runs until the next [header] or end of file.
j = src.find("\n[", i + 1)
if j == -1:
    j = len(src)
body = src[i:j]
if re.search(r"^\s*verify_jwt\s*=", body, re.M):
    body = re.sub(r"^\s*verify_jwt\s*=.*$", "verify_jwt = false", body, flags=re.M)
else:
    body = body.rstrip() + "\nverify_jwt = false\n"
open(path, "w").write(src[:i] + body + src[j:])
print(f"  {path}: verify_jwt = false")
PY
else
  printf '\n[functions.%s]\nverify_jwt = false\n' "$FN" >> "$CONFIG"
  echo "  $CONFIG: added [functions.$FN] verify_jwt = false"
fi

echo
echo "Deploying $FN with JWT verification disabled..."

# The flag is what actually takes effect on this deploy. config.toml above is for
# the NEXT one.
supabase functions deploy "$FN" \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo
echo "Done."
echo
echo "Check it worked: open a deal room with an article and the preview images"
echo "should load. If they are still blank, open the browser console -- a 401 on"
echo "the link-preview call means verification is still on."
