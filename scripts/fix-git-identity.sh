#!/usr/bin/env bash
#
# Set the git identity for THIS repository only.
#
# Vercel rejected a deploy because the commit email (allcourtsio@gmail.com) does
# not match a GitHub account with access. That address belongs to a different
# project and should never appear in DealStudio history again.
#
# --local, not --global: this pins the identity to this repo, so working on
# AllCourts later cannot silently reintroduce the wrong address here.

set -euo pipefail

EMAIL="jaquimccarthy@gmail.com"   # must match a verified email on the GitHub account
NAME="Jaqui McCarthy"

git config --local user.email "$EMAIL"
git config --local user.name  "$NAME"

echo "This repo now commits as:"
echo "  $(git config --local user.name) <$(git config --local user.email)>"
echo
echo "Commits ALREADY made with the wrong address keep it -- git history is"
echo "immutable. If the rejected commit is the most recent one and has not been"
echo "pushed anywhere else, you can re-stamp it:"
echo
echo "  git commit --amend --reset-author --no-edit"
echo "  git push --force-with-lease origin main"
echo
echo "Only do that if you are the only person working on this branch."
