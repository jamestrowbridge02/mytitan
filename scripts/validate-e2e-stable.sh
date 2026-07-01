#!/usr/bin/env bash

set -uo pipefail

TS="$(date +%Y%m%d-%H%M%S)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG="${1:-/tmp/mytitan-validation/full-suite-stable-${TS}.log}"
JSON_DIR="${PLAYWRIGHT_OUTPUT_DIR:-/tmp/pw-results}"
AUTH_DIR="${PLAYWRIGHT_AUTH_DIR:-/tmp/mytitan-playwright}"
APP_DIR="${REPO_ROOT}/app"
LOCK_FILE="${MYTITAN_E2E_LOCK_FILE:-/tmp/mytitan-validation/full-suite.lock}"
WORKERS="${PLAYWRIGHT_STABLE_WORKERS:-1}"
TEST_TIMEOUT_MS="${PLAYWRIGHT_TEST_TIMEOUT_MS:-45000}"
SUITE_TIMEOUT_SECONDS="${PLAYWRIGHT_SUITE_TIMEOUT_SECONDS:-7200}"

read_env_value() {
  local name="$1"
  if [ -n "${!name:-}" ]; then
    printf '%s' "${!name}"
    return 0
  fi
  local env_file line value
  for env_file in "${REPO_ROOT}/.env.local" "${REPO_ROOT}/.env"; do
    [ -f "${env_file}" ] || continue
    line="$(grep -E "^${name}=" "${env_file}" | tail -n 1 || true)"
    [ -n "${line}" ] || continue
    value="${line#*=}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    printf '%s' "${value}"
    return 0
  done
  return 1
}

boundary_refuse() {
  echo "BOUNDARY_REFUSED: $1"
  echo "EXIT_CODE:208"
  exit 208
}

assert_validation_boundary() {
  local runtime_env database_url app_public_url api_public_url
  runtime_env="$(read_env_value MYTITAN_RUNTIME_ENV 2>/dev/null || read_env_value MYTITAN_ENV 2>/dev/null || true)"
  case "${runtime_env}" in
    e2e|test|validation|development|dev|local) ;;
    *) boundary_refuse "MYTITAN_RUNTIME_ENV must be e2e, test, validation, development, dev, or local before stable validation can seed fixtures." ;;
  esac
  database_url="$(read_env_value DATABASE_URL 2>/dev/null || true)"
  if ! printf '%s' "${database_url}" | grep -Eiq '(e2e|test|validation|staging|dev|local)'; then
    boundary_refuse "DATABASE_URL must identify a dedicated non-production database before stable validation can seed fixtures."
  fi
  app_public_url="$(read_env_value APP_PUBLIC_URL 2>/dev/null || true)"
  api_public_url="$(read_env_value API_PUBLIC_URL 2>/dev/null || true)"
  if printf '%s\n%s\n' "${app_public_url}" "${api_public_url}" | grep -Eiq '(^|[./])mytitan\.co\.uk'; then
    boundary_refuse "APP_PUBLIC_URL/API_PUBLIC_URL point at public MyTitan hosts; stable validation requires isolated URLs."
  fi
}

mkdir -p "${JSON_DIR}" "${AUTH_DIR}" /tmp/mytitan-validation
assert_validation_boundary

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
  bash "${REPO_ROOT}/scripts/cleanup-orphaned-playwright.sh" --apply --min-age 60 >> "${LOG}" 2>&1 || true
  bash "${REPO_ROOT}/scripts/cleanup-validation-artifacts.sh" --apply --days 7 >> "${LOG}" 2>&1 || true
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
bash "${REPO_ROOT}/scripts/cleanup-orphaned-playwright.sh" --apply --min-age 600 >> "${LOG}" 2>&1 || true
bash "${REPO_ROOT}/scripts/cleanup-validation-artifacts.sh" --apply --days 7 >> "${LOG}" 2>&1 || true

if ! docker compose -p mytitan -f "${REPO_ROOT}/docker-compose.yml" up -d --force-recreate api >> "${LOG}" 2>&1; then
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
