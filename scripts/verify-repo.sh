#!/usr/bin/env bash
# ============================================================================
# REPO GUARD. Run this FIRST in any deploy chain:
#   ./scripts/verify-repo.sh && unzip ... && npm run build && git push ...
#
# It aborts (non-zero exit) unless the current git remote is the DealStudio
# repo. Because it is chained with &&, a wrong repo stops the whole deploy
# before anything is built, committed, or pushed. This is what prevents an
# AllCourts (or any other) push from ever landing here.
# ============================================================================

set -e

EXPECTED="PrincessJaqui/DealStudio"
REMOTE="$(git remote get-url origin 2>/dev/null || echo '')"

echo ""
echo "============================================================"
echo "  REPO CHECK"
echo "  Folder:  $(pwd)"
echo "  Remote:  ${REMOTE:-<none>}"
echo "============================================================"

if [ -z "$REMOTE" ]; then
  echo ""
  echo "  X  STOP: no git remote found. This is not a git repo,"
  echo "     or origin is not set. NOT deploying."
  echo ""
  exit 1
fi

# The remote must contain PrincessJaqui/DealStudio. AllCourts (or anything
# else) will not match, and the deploy aborts.
case "$REMOTE" in
  *"$EXPECTED"*)
    echo ""
    echo "  OK  This is the DealStudio repo. Safe to deploy."
    echo ""
    ;;
  *)
    echo ""
    echo "  ####################################################"
    echo "  #                                                  #"
    echo "  #   X  STOP -- WRONG REPO. NOT DEPLOYING.          #"
    echo "  #                                                  #"
    echo "  #   Expected a remote containing:                  #"
    echo "  #      $EXPECTED"
    echo "  #                                                  #"
    echo "  #   But this repo points at:                       #"
    echo "  #      $REMOTE"
    echo "  #                                                  #"
    echo "  #   You are about to push DealStudio code to the   #"
    echo "  #   WRONG repository. Aborting so nothing breaks.  #"
    echo "  #                                                  #"
    echo "  ####################################################"
    echo ""
    exit 1
    ;;
esac
