#!/usr/bin/env bash
set -euo pipefail

TENANT_ID="${1:-}"
DETAIL="${2:-API healthcheck failed or returned a degraded response.}"

if [[ -z "${TENANT_ID}" ]]; then
  echo "Usage: $0 <tenant-id> [detail]" >&2
  exit 1
fi

docker compose exec -T api /bin/sh -lc "cd /app && npx ts-node --transpile-only scripts/send-operational-alert.ts '${TENANT_ID}' health_degraded --severity=critical --title='Health degraded' --body='${DETAIL//\'/}' --recommended-action='Check API health, webhook delivery, and outbound email/scheduler status.'" >/dev/null
