#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-/opt/mytitan}"

if ! command -v rg >/dev/null 2>&1; then
  echo "STATUS:needs_setup"
  echo "DETAIL: ripgrep is required for the Stripe key guard."
  exit 2
fi

matches="$(
  rg -l --hidden --no-ignore-vcs \
    --glob '!.git/**' \
    --glob '!**/node_modules/**' \
    --glob '!**/.next/**' \
    --glob '!**/test-results/**' \
    --glob '!**/playwright-report/**' \
    --glob '!**/*.log' \
    --glob '!**/.env' \
    --glob '!**/.env.*' \
    --glob '!**/*env.local' \
    --glob '!mytitan-system-check/**' \
    '(^|[^A-Za-z0-9_])(sk|pk)_(live|test)_[A-Za-z0-9]{12,}' \
    "${BASE}" || true
)"

if [ -n "${matches}" ]; then
  echo "STATUS:blocked"
  echo "DETAIL: Real-looking hardcoded Stripe keys were found. Rotate exposed keys and move values to the secret store."
  echo "FILES:"
  printf '%s\n' "${matches}" | sed "s#^${BASE}/##" | sort -u
  exit 1
fi

echo "STATUS:ready"
echo "DETAIL: No real-looking hardcoded Stripe sk_/pk_ keys found in scanned source, scripts, or docs."
