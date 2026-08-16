#!/usr/bin/env bash
# Run this from inside your local My-job repo folder:
#   bash check-repo-sync.sh
#
# It checks whether your parseSalaryToAnnual fix actually made it to
# GitHub's main branch, which is what Vercel builds from.

set -u
echo "=== 1. Current branch ==="
git branch --show-current

echo
echo "=== 2. Uncommitted / untracked changes ==="
git status --short
echo "(if utils.ts or OfferComparison.tsx show up above, they were never committed)"

echo
echo "=== 3. Does the LOCAL file contain the fix? ==="
if grep -q "parseSalaryToAnnual" src/lib/utils.ts 2>/dev/null; then
  echo "OK - found in local src/lib/utils.ts"
else
  echo "MISSING - parseSalaryToAnnual is NOT in your local src/lib/utils.ts"
fi

echo
echo "=== 4. Does the LAST COMMIT on this branch contain the fix? ==="
if git show HEAD:src/lib/utils.ts 2>/dev/null | grep -q "parseSalaryToAnnual"; then
  echo "OK - found in the last commit (HEAD)"
else
  echo "MISSING - the last commit's version of utils.ts does NOT have parseSalaryToAnnual"
  echo "  -> you likely edited the file but never committed it"
fi

echo
echo "=== 5. Is your local main up to date with GitHub's main? ==="
git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
echo "Local HEAD:      $LOCAL"
echo "origin/main HEAD: $REMOTE"
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "OK - your local main matches GitHub's main"
else
  echo "MISMATCH - your local branch and GitHub's main are different commits"
  echo "  -> run: git push origin main"
fi

echo
echo "=== 6. Does GitHub's main branch (origin/main) contain the fix? ==="
if git show origin/main:src/lib/utils.ts 2>/dev/null | grep -q "parseSalaryToAnnual"; then
  echo "OK - GitHub's main branch HAS the fix. Vercel should build fine."
  echo "  If Vercel still fails, check Project Settings -> Git in Vercel"
  echo "  to confirm it's watching 'main' on 'sumitparajulee/My-job'."
else
  echo "MISSING - GitHub's main branch does NOT have the fix yet."
  echo "  -> commit and push: git add -A && git commit -m 'add parseSalaryToAnnual' && git push origin main"
fi
  
