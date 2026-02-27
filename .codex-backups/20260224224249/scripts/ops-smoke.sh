#!/usr/bin/env bash
set -euo pipefail

echo "== OPS SMOKE =="

set +e
c1=$(curl -s -o /dev/null -w "%{http_code}" https://api.mytitan.co.uk/jobs/board)
c2=$(curl -s -o /dev/null -w "%{http_code}" https://api.mytitan.co.uk/inventory/items)
c3=$(curl -s -o /dev/null -w "%{http_code}" https://api.mytitan.co.uk/locations)
set -e

echo "GET /jobs/board       -> $c1"
echo "GET /inventory/items  -> $c2"
echo "GET /locations        -> $c3"

pass=1
for code in "$c1" "$c2" "$c3"; do
  if [ "$code" != "401" ] && [ "$code" != "403" ]; then
    pass=0
  fi
done

if [ "$pass" -eq 1 ]; then
  echo "PASS"
  exit 0
fi

echo "FAIL"
exit 1

