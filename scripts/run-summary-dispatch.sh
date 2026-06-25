#!/usr/bin/env bash

set -uo pipefail

CADENCE="${1:-}"
EXTRA_ARG="${2:-}"

case "${CADENCE}" in
  daily|weekly|monthly|quarterly|annual)
    ;;
  *)
    echo "Usage: bash ./scripts/run-summary-dispatch.sh <daily|weekly|monthly|quarterly|annual> [--dry-run]"
    exit 2
    ;;
esac

if [[ -n "${EXTRA_ARG}" && "${EXTRA_ARG}" != "--dry-run" ]]; then
  echo "Only --dry-run is supported as the optional second argument."
  exit 2
fi

mkdir -p /tmp/mytitan-validation
TS="$(date +%Y%m%d-%H%M%S)"
LOG="/tmp/mytitan-validation/summary-dispatch-${CADENCE}-${TS}.log"

if ! docker compose ps --status running api >/dev/null 2>&1; then
  echo "SUMMARY_DISPATCH_BOOTSTRAP_ERROR: api service is not running" | tee -a "${LOG}"
  echo "EXIT_CODE:20" | tee -a "${LOG}"
  exit 20
fi

echo "STARTED_AT=$(date -Is)" | tee -a "${LOG}"
echo "CADENCE=${CADENCE}" | tee -a "${LOG}"
echo "LOG=${LOG}" | tee -a "${LOG}"

docker compose exec -T api /bin/sh -lc "cd /app && npm run summary:dispatch -- ${CADENCE}${EXTRA_ARG:+ ${EXTRA_ARG}}" 2>&1 | tee -a "${LOG}"
CODE=${PIPESTATUS[0]}

echo "FINISHED_AT=$(date -Is)" | tee -a "${LOG}"
echo "EXIT_CODE:${CODE}" | tee -a "${LOG}"
exit "${CODE}"
