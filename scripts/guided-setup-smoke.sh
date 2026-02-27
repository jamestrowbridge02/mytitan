#!/usr/bin/env bash
set -euo pipefail

API_BASE="${1:-https://api.mytitan.co.uk}"

code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_BASE/guided-setup/status" || true)
echo "authless /guided-setup/status -> $code"
if [ "$code" != "401" ]; then
  echo "Expected 401 for authless request"
  exit 1
fi

if [ -n "${API_TOKEN:-}" ]; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -H "Authorization: Bearer $API_TOKEN" "$API_BASE/guided-setup/status" || true)
  echo "authed /guided-setup/status -> $code"
  if [ "$code" != "200" ]; then
    echo "Expected 200 for authed request"
    exit 1
  fi
else
  echo "API_TOKEN not set; skipping authed check"
fi
