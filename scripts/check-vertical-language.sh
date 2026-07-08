#!/usr/bin/env bash
# scripts/check-vertical-language.sh
#
# CI lint rule: block stale vertical-specific language in user-facing
# files (app/, components/ .tsx/.ts).  Drift is a horizontal, general-
# purpose platform — keep user-facing copy vertical-neutral.
#
# Usage:  bash scripts/check-vertical-language.sh
# Exit 0 = clean, Exit 1 = violations found.

set -euo pipefail

# Only these patterns in user-facing code.  Developer comments that
# reference "RIA" for audience context are intentionally excluded.
PATTERNS=(
  "financial advisor"
  "wealth management"
  "Form ADV"
)

# Directories + extensions that reach end users
SEARCH_PATHS="app/ components/"
EXTENSIONS="--include=*.tsx --include=*.ts"

FOUND=0

for pattern in "${PATTERNS[@]}"; do
  # Case-insensitive grep; skip test files, snapshots, eval bench, and this script
  MATCHES=$(grep -rni $EXTENSIONS "$pattern" $SEARCH_PATHS \
    --exclude='*.test.*' \
    --exclude='*.spec.*' \
    --exclude='*.snap' \
    --exclude-dir='__tests__' \
    --exclude-dir='fiduciary-bench' \
    2>/dev/null || true)

  if [ -n "$MATCHES" ]; then
    if [ "$FOUND" -eq 0 ]; then
      echo "Stale vertical language detected in user-facing files:"
      echo "---------------------------------------------------"
    fi
    FOUND=1
    echo ""
    echo "  Pattern: \"$pattern\""
    echo "$MATCHES" | while IFS= read -r line; do
      echo "    $line"
    done
  fi
done

if [ "$FOUND" -ne 0 ]; then
  echo ""
  echo "Drift is a horizontal platform. Remove or replace the above vertical-specific references."
  exit 1
fi

echo "Vertical language check passed -- no stale vertical references."
exit 0
