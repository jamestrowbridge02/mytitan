#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.validation.yml"
ENV_FILE="${MYTITAN_VALIDATION_ENV_FILE:-${REPO_ROOT}/.env.validation.example}"
PROJECT="${MYTITAN_VALIDATION_PROJECT:-mytitan-validation}"
API_CONTAINER="${MYTITAN_VALIDATION_API_CONTAINER:-mytitan_validation_api}"
APP_DIR="${REPO_ROOT}/app"
JSON_DIR="${PLAYWRIGHT_OUTPUT_DIR:-/tmp/pw-results-validation}"
AUTH_DIR="${PLAYWRIGHT_AUTH_DIR:-/tmp/mytitan-playwright-validation}"
WORKERS="${PLAYWRIGHT_STABLE_WORKERS:-1}"
TEST_TIMEOUT_MS="${PLAYWRIGHT_TEST_TIMEOUT_MS:-45000}"
SUITE_TIMEOUT_SECONDS="${PLAYWRIGHT_SUITE_TIMEOUT_SECONDS:-7200}"
JSON="${JSON_DIR}/isolated-final-proof.json"
EXTRA_TEST_ARGS=()
if [[ -n "${PLAYWRIGHT_TEST_ARGS:-}" ]]; then
  # Optional local narrowing for debugging; default remains the full stable suite.
  read -r -a EXTRA_TEST_ARGS <<< "${PLAYWRIGHT_TEST_ARGS}"
fi

mkdir -p "${JSON_DIR}" "${AUTH_DIR}" /tmp/mytitan-validation

cleanup() {
  if [[ "${KEEP_VALIDATION_STACK:-0}" != "1" ]]; then
    docker compose --env-file "${ENV_FILE}" -p "${PROJECT}" -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "ISOLATED_VALIDATION_PROJECT=${PROJECT}"
echo "ISOLATED_VALIDATION_ENV_FILE=${ENV_FILE}"
echo "ISOLATED_VALIDATION_JSON=${JSON}"

docker compose --env-file "${ENV_FILE}" -p "${PROJECT}" -f "${COMPOSE_FILE}" down --volumes --remove-orphans >/dev/null 2>&1 || true
docker compose --env-file "${ENV_FILE}" -p "${PROJECT}" -f "${COMPOSE_FILE}" up -d --build validation_postgres validation_redis validation_api validation_app validation_marketing

echo "Waiting for validation API..."
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3100/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:3100/health >/dev/null

echo "Migrating validation database..."
docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npx prisma migrate deploy'

echo "Marking validation database..."
docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npm run boundary:mark-database -- --environment=validation --source=validate-isolated-e2e'
docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npm run boundary:database-marker'

echo "Seeding validation fixtures..."
docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npm run seed:e2e'

echo "Running stable suite against isolated validation stack..."
cd "${APP_DIR}"
rm -rf "${AUTH_DIR:?}"/* "${JSON_DIR:?}"/* "${APP_DIR}/test-results" 2>/dev/null || true

MYTITAN_RUNTIME_ENV=validation \
MYTITAN_E2E_API_CONTAINER="${API_CONTAINER}" \
PLAYWRIGHT_USE_EXISTING_SERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 \
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:3100 \
PLAYWRIGHT_AUTH_DIR="${AUTH_DIR}" \
NEXT_PUBLIC_MYTITAN_DISABLE_SSE=1 \
NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO=off \
STRIPE_SECRET_KEY=validation_stripe_disabled_placeholder \
STRIPE_WEBHOOK_SECRET=validation_stripe_webhook_secret_placeholder \
STRIPE_PRICE_SOLE_TRADER_MONTHLY=price_validation_sole_monthly \
STRIPE_PRICE_SOLE_TRADER_ANNUAL=price_validation_sole_annual \
STRIPE_PRICE_BUSINESS_MONTHLY=price_validation_business_monthly \
STRIPE_PRICE_BUSINESS_ANNUAL=price_validation_business_annual \
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_validation_enterprise_monthly \
STRIPE_PRICE_ENTERPRISE_ANNUAL=price_validation_enterprise_annual \
PLAYWRIGHT_SKIP_DOCKER_SEED=1 \
PLAYWRIGHT_STABLE_MODE=1 \
PLAYWRIGHT_JSON_OUTPUT_NAME="${JSON}" \
timeout --signal=TERM --kill-after=30s "${SUITE_TIMEOUT_SECONDS}s" \
npx playwright test --workers="${WORKERS}" --reporter=line,json --output="${JSON_DIR}" --timeout="${TEST_TIMEOUT_MS}" \
  "${EXTRA_TEST_ARGS[@]}"
