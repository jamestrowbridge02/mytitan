#!/usr/bin/env bash
set -euo pipefail

cd /opt/mytitan

fail=0
warn=0

echo "== MyTitan Release Smoke =="
docker compose ps || { echo "FAIL: docker compose ps failed"; exit 1; }

echo "[check] API health with retry"
ok=0
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://api.mytitan.co.uk/health || true)
  if [ "$code" = "200" ]; then
    ok=1
    echo "PASS: api health code=$code (attempt $i)"
    break
  fi
  sleep 3
done
if [ "$ok" -ne 1 ]; then
  echo "FAIL: api health did not return 200"
  fail=1
fi

echo "[check] App HEAD"
app_code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 10 https://app.mytitan.co.uk || true)
if [ "$app_code" = "200" ]; then
  echo "PASS: app code=$app_code"
else
  echo "FAIL: app code=$app_code"
  fail=1
fi

echo "[check] Marketing HEAD"
mkt_code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 10 https://mytitan.co.uk || true)
if [ "$mkt_code" = "200" ]; then
  echo "PASS: marketing code=$mkt_code"
else
  echo "FAIL: marketing code=$mkt_code"
  fail=1
fi

echo "[check] Webhooks non-404"
w1=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.mytitan.co.uk/stripe/webhook || true)
w2=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.mytitan.co.uk/billing/webhook || true)
echo "stripe/webhook=$w1 billing/webhook=$w2"
if [ "$w1" = "404" ] || [ "$w2" = "404" ]; then
  echo "FAIL: webhook route returned 404"
  fail=1
fi

demo_flag=$(grep -E '^MYTITAN_FEATURE_PUBLIC_DEMO=' /opt/mytitan/.env 2>/dev/null | head -n1 | cut -d= -f2- | tr '[:upper:]' '[:lower:]' || true)
if [ "$demo_flag" = "on" ] || [ "$demo_flag" = "true" ] || [ "$demo_flag" = "1" ]; then
  echo "[check]  login endpoint"
  demo_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://api.mytitan.co.uk/public/-login || true)
  if [ "$demo_code" = "200" ] || [ "$demo_code" = "429" ]; then
    echo "PASS: -login code=$demo_code"
  else
    echo "FAIL: -login code=$demo_code"
    fail=1
  fi
else
  echo "WARN:  flag OFF, skipping -login check"
  warn=1
fi

echo "[check] Billing page route"
billing_code=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 10 https://app.mytitan.co.uk/dashboard/billing || true)
if [ "$billing_code" = "200" ] || [ "$billing_code" = "307" ] || [ "$billing_code" = "308" ]; then
  echo "PASS: billing route code=$billing_code"
else
  echo "WARN: billing route code=$billing_code"
  warn=1
fi

if [ "$fail" -ne 0 ]; then
  echo "== RESULT: FAIL =="
  exit 1
fi

if [ "$warn" -ne 0 ]; then
  echo "== RESULT: WARN =="
  exit 0
fi

echo "== RESULT: PASS =="
