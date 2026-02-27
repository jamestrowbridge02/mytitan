#!/usr/bin/env bash
set -euo pipefail

echo "== OPS CORE SMOKE =="

base="https://api.mytitan.co.uk"
pass=1

check_auth_route() {
  local path="$1"
  local method="${2:-GET}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X "$method" "${base}${path}" || true)
  echo "${method} ${path} -> ${code}"
  if [ "$code" != "401" ] && [ "$code" != "403" ]; then
    pass=0
  fi
}

check_auth_route /jobs/board-v2
check_auth_route /booking/services
check_auth_route /crm/accounts/search

if [ "$pass" -eq 1 ]; then
  echo "PASS"
  exit 0
fi

echo "FAIL"
exit 1
