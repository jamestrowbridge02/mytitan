#!/usr/bin/env bash
set -euo pipefail

cd /opt/mytitan

echo "== Top1 Smoke =="
docker compose ps >/dev/null

echo "[check] /health"
health_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://api.mytitan.co.uk/health || true)
if [ "$health_code" != "200" ]; then
  echo "FAIL: /health code=$health_code"
  exit 1
fi

echo "[check] app/marketing HEAD"
app_code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 10 https://app.mytitan.co.uk || true)
mkt_code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 10 https://mytitan.co.uk || true)
if [ "$app_code" != "200" ]; then
  echo "FAIL: app HEAD code=$app_code"
  exit 1
fi
if [ "$mkt_code" != "200" ]; then
  echo "FAIL: marketing HEAD code=$mkt_code"
  exit 1
fi

expect_auth_route() {
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://api.mytitan.co.uk${path}" || true)
  echo "${path} -> ${code}"
  if [ "$code" != "401" ] && [ "$code" != "403" ]; then
    echo "FAIL: ${path} expected 401/403, got ${code}"
    exit 1
  fi
}

echo "[check] protected routes return 401/403 (not 404)"
expect_auth_route /jobs/board
expect_auth_route /locations
expect_auth_route /inventory/items
expect_auth_route /metrics/overview
expect_auth_route /auth/resend-verification
expect_auth_route /command-centre/views
expect_auth_route /inventory/alerts

echo "[check] public forgot-password returns 202"
fp_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.mytitan.co.uk/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"nobody@example.com"}' || true)
echo "/auth/forgot-password -> ${fp_code}"
if [ "$fp_code" != "202" ]; then
  echo "FAIL: /auth/forgot-password expected 202"
  exit 1
fi

echo "PASS"
