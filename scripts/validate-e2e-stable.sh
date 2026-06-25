#!/usr/bin/env bash

set -uo pipefail

TS="$(date +%Y%m%d-%H%M%S)"
LOG="${1:-/tmp/mytitan-validation/full-suite-stable-${TS}.log}"
JSON_DIR="${PLAYWRIGHT_OUTPUT_DIR:-/tmp/pw-results}"
AUTH_DIR="${PLAYWRIGHT_AUTH_DIR:-/tmp/mytitan-playwright}"
APP_DIR="/opt/mytitan/app"
LOCK_FILE="${MYTITAN_E2E_LOCK_FILE:-/tmp/mytitan-validation/full-suite.lock}"
WORKERS="${PLAYWRIGHT_STABLE_WORKERS:-1}"
TEST_TIMEOUT_MS="${PLAYWRIGHT_TEST_TIMEOUT_MS:-45000}"
SUITE_TIMEOUT_SECONDS="${PLAYWRIGHT_SUITE_TIMEOUT_SECONDS:-7200}"

mkdir -p "${JSON_DIR}" "${AUTH_DIR}" /tmp/mytitan-validation

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "VALIDATION_ALREADY_RUNNING: another full stable validation holds ${LOCK_FILE}"
  echo "EXIT_CODE:209"
  exit 209
fi

cd "${APP_DIR}" || {
  echo "BOOTSTRAP_ERROR: cd failed" | tee -a "${LOG}"
  echo "EXIT_CODE:200" | tee -a "${LOG}"
  exit 200
}

JSON="${JSON_DIR}/final-proof.json"

cleanup_after_validation() {
  bash /opt/mytitan/scripts/cleanup-orphaned-playwright.sh --apply --min-age 60 >> "${LOG}" 2>&1 || true
  bash /opt/mytitan/scripts/cleanup-validation-artifacts.sh --apply --days 7 >> "${LOG}" 2>&1 || true
}
trap cleanup_after_validation EXIT

: > "${LOG}"
echo "STARTED_AT=$(date -Is)" | tee -a "${LOG}"
echo "JSON_REPORT=${JSON}" | tee -a "${LOG}"
echo "WORKERS=${WORKERS}" | tee -a "${LOG}"
echo "TEST_TIMEOUT_MS=${TEST_TIMEOUT_MS}" | tee -a "${LOG}"
echo "SUITE_TIMEOUT_SECONDS=${SUITE_TIMEOUT_SECONDS}" | tee -a "${LOG}"

find "${JSON_DIR:?}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
find "${AUTH_DIR:?}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
rm -rf "${APP_DIR}/test-results"
bash /opt/mytitan/scripts/cleanup-orphaned-playwright.sh --apply --min-age 600 >> "${LOG}" 2>&1 || true
bash /opt/mytitan/scripts/cleanup-validation-artifacts.sh --apply --days 7 >> "${LOG}" 2>&1 || true

if ! docker compose -f /opt/mytitan/docker-compose.yml up -d --force-recreate api >> "${LOG}" 2>&1; then
  echo "BOOTSTRAP_ERROR: api recreate failed" | tee -a "${LOG}"
  echo "EXIT_CODE:201" | tee -a "${LOG}"
  exit 201
fi

if ! docker exec -w /app mytitan_api /bin/sh -lc 'npm run seed:e2e' >> "${LOG}" 2>&1; then
  echo "BOOTSTRAP_ERROR: e2e seed failed" | tee -a "${LOG}"
  echo "EXIT_CODE:202" | tee -a "${LOG}"
  exit 202
fi

PLAYWRIGHT_USE_EXISTING_SERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_MYTITAN_DISABLE_SSE=1 \
PLAYWRIGHT_SKIP_DOCKER_SEED=1 \
PLAYWRIGHT_STABLE_MODE=1 \
PLAYWRIGHT_JSON_OUTPUT_NAME="${JSON}" \
timeout --signal=TERM --kill-after=30s "${SUITE_TIMEOUT_SECONDS}s" \
npx playwright test --workers="${WORKERS}" --reporter=line,json --output="${JSON_DIR}" --timeout="${TEST_TIMEOUT_MS}" 2>&1 | tee -a "${LOG}"

CODE=${PIPESTATUS[0]}
echo "FINISHED_AT=$(date -Is)" | tee -a "${LOG}"
echo "EXIT_CODE:${CODE}" | tee -a "${LOG}"
exit "${CODE}"
