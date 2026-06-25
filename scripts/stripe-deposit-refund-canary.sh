#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
APP_DIR="${BASE}/app"
ENV_LOCAL="${BASE}/.env.local"
cd "${BASE}"

upsert_env_value() {
  local name="$1"
  local value="$2"
  touch "${ENV_LOCAL}"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v key="${name}" -v val="${value}" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 {
      if (!updated) {
        print key "=" val
        updated = 1
      }
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" val
      }
    }
  ' "${ENV_LOCAL}" > "${tmp_file}"
  mv "${tmp_file}" "${ENV_LOCAL}"
}

record_canary_status() {
  local status="$1"
  upsert_env_value "MYTITAN_LAST_STRIPE_CANARY_STATUS" "${status}"
}

read_env_value() {
  local name="$1"
  if [ -n "${!name:-}" ]; then
    printf '%s' "${!name}"
    return 0
  fi

  local env_file line value
  for env_file in "${BASE}/.env.local" "${BASE}/.env"; do
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

stripe_key="$(read_env_value STRIPE_SECRET_KEY 2>/dev/null || true)"
if [ -z "${stripe_key}" ]; then
  record_canary_status "unavailable_missing_stripe_key"
  echo "REFUSED: Stripe canary requires STRIPE_SECRET_KEY in the runtime or env file."
  exit 2
fi

stripe_mode="unknown"
case "${stripe_key}" in
  sk_test_*|rk_test_*) stripe_mode="test" ;;
  sk_live_*|rk_live_*) stripe_mode="live" ;;
esac

if [ "${stripe_mode}" = "unknown" ]; then
  record_canary_status "unavailable_unknown_key_mode"
  echo "REFUSED: Stripe canary could not determine key mode from the configured prefix."
  exit 3
fi

if [ "${stripe_mode}" = "live" ] && [ "${MYTITAN_CANARY_CONFIRM_LIVE:-0}" != "1" ]; then
  record_canary_status "refused_live_without_confirmation"
  echo "REFUSED: Stripe canary will not run against live-mode keys without MYTITAN_CANARY_CONFIRM_LIVE=1."
  exit 4
fi

if [ "${stripe_mode}" = "live" ]; then
  echo "Running live-mode canary after explicit confirmation."
else
  echo "Running test-mode canary."
fi

cd "${APP_DIR}"
PLAYWRIGHT_SKIP_DOCKER_SEED=1 npm run test:e2e:docker -- \
  e2e/stripe-webhooks.spec.ts \
  --grep "verified booking deposit webhooks mark the deposit paid only after Stripe confirms it|booking deposit refunds stay pending until Stripe confirms them and duplicate refund webhooks stay idempotent"
record_canary_status "success_${stripe_mode}_mode"
