#!/usr/bin/env bash
set -euo pipefail

base="${API_BASE_URL:-https://api.mytitan.co.uk}"
app_base="${APP_BASE_URL:-https://app.mytitan.co.uk}"
pass=1

# Demo flag source is dotenv to avoid false warnings from unset shell env.
demo_flag_source="dotenv"
demo_flag_value="unknown"

echo "== DEMO POLISH SMOKE =="
echo "api=${base} app=${app_base}"

check_code() {
  local name="$1"
  local code="$2"
  local expected_a="$3"
  local expected_b="${4:-}"
  echo "${name} -> ${code}"
  if [ "$code" != "$expected_a" ] && { [ -n "$expected_b" ] && [ "$code" != "$expected_b" ]; }; then
    pass=0
  fi
}

api_health=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${base}/health" || true)
app_health=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${app_base}" || true)
check_code "GET /health" "$api_health" "200"
check_code "GET app /" "$app_health" "200" "301"

# Read demo flags from /opt/mytitan/.env (same operational source used by release smoke).
# We evaluate both API and NEXT_PUBLIC variants; on if either is on/true/1.
demo_api_flag=$(grep -E ^MYTITAN_FEATURE_PUBLIC_DEMO= /opt/mytitan/.env 2>/dev/null | head -n1 | cut -d= -f2- | tr [:upper:] [:lower:] || true)
demo_app_flag=$(grep -E ^NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO= /opt/mytitan/.env 2>/dev/null | head -n1 | cut -d= -f2- | tr [:upper:] [:lower:] || true)

is_on() {
  case "${1:-}" in
    on|true|1) return 0 ;;
    *) return 1 ;;
  esac
}

if is_on "$demo_api_flag" || is_on "$demo_app_flag"; then
  demo_flag_value="on"
else
  if [ -n "$demo_api_flag$demo_app_flag" ]; then
    demo_flag_value="off"
  else
    demo_flag_value="unknown"
  fi
fi

demo_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "${base}/public/demo-login" || true)

if [ "$demo_flag_value" = "on" ]; then
  check_code "POST /public/demo-login" "$demo_code" "200" "429"
else
  # Warning only when dotenv indicates off/unknown but endpoint is still reachable.
  if [ "$demo_code" = "200" ] || [ "$demo_code" = "429" ]; then
    echo "WARN: demo flag appears ${demo_flag_value}; endpoint reachable (code=${demo_code})"
  fi
fi

check_auth_route() {
  local path="$1"
  local method="${2:-GET}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X "$method" "${base}${path}" || true)
  echo "${method} ${path} -> ${code}"
  if [ "$code" = "404" ]; then
    pass=0
  fi
  if [ "$code" != "401" ] && [ "$code" != "403" ] && [ "$code" != "400" ]; then
    pass=0
  fi
}

check_auth_route /notifications GET
check_auth_route /notifications/preferences GET
check_auth_route /notifications/preferences PATCH
check_auth_route /jobs/board-v2 GET

bulk_v2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "${base}/jobs/bulk-v2" || true)
bulk_v1=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "${base}/jobs/bulk" || true)
echo "POST /jobs/bulk-v2 -> ${bulk_v2}"
echo "POST /jobs/bulk    -> ${bulk_v1}"
if [ "$bulk_v2" = "404" ] && [ "$bulk_v1" = "404" ]; then
  pass=0
fi

# Non-fatal self-check summary (no secrets).
echo "demo_flag_source=${demo_flag_source}"
echo "demo_flag_value=${demo_flag_value}"
echo "demo_endpoint_status=${demo_code}"

if [ "$pass" -eq 1 ]; then
  echo "PASS"
  exit 0
fi

echo "FAIL"
exit 1
