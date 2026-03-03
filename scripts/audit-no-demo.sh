#!/bin/sh
set -eu

# Tracked-source-only audit. Intentionally excludes build outputs/backups.
git grep -nEI "Book a demo|Try demo|\bDemo\b|/demo|demo-account|demo@mytitan\.co\.uk|demo-login|demo-coach|isPublicDemoEnabled" -- \
  ':!**/.next/**' \
  ':!app/.next/**' \
  ':!**/dist/**' \
  ':!**/build/**' \
  ':!**/.codex-backups/**' \
  ':!codex-backups/**' \
  ':!**/node_modules/**' \
  || exit 0

echo "ERROR: demo references found in tracked source (see matches above)." >&2
exit 1
