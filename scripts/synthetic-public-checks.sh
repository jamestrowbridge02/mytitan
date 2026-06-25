#!/usr/bin/env bash
set -euo pipefail

BASE="${MYTITAN_BASE_DIR:-/opt/mytitan}"

read_env_value() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    printf '%s' "${!name}"
    return 0
  fi
  local env_file line value
  for env_file in "${BASE}/.env.local" "${BASE}/.env"; do
    [[ -f "${env_file}" ]] || continue
    line="$(grep -E "^${name}=" "${env_file}" | tail -n 1 || true)"
    [[ -n "${line}" ]] || continue
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

check_url() {
  local label="$1"
  local url="$2"
  local expected_pattern="$3"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${url}" 2>/dev/null || true)"
  if [[ "${code}" =~ ${expected_pattern} ]]; then
    echo "${label}: ready ${code} ${url}"
    return 0
  fi
  echo "${label}: failed ${code:-unknown} ${url}"
  return 1
}

app_url="$(read_env_value APP_PUBLIC_URL 2>/dev/null || true)"
api_url="$(read_env_value API_PUBLIC_URL 2>/dev/null || true)"
marketing_url="$(read_env_value MARKETING_PUBLIC_URL 2>/dev/null || true)"
if [[ -z "${marketing_url}" && -n "${app_url}" ]]; then
  marketing_url="$(printf '%s' "${app_url}" | sed -E 's#://app\.#://#')"
fi

status=0
check_url "app_login" "${app_url%/}/login" '^(200|301|302|307|308)$' || status=1
check_url "api_health" "${api_url%/}/health" '^(200)$' || status=1
check_url "marketing_home" "${marketing_url%/}" '^(200|301|302|307|308)$' || status=1

safe_booking_url="$(read_env_value MYTITAN_SYNTHETIC_PUBLIC_BOOKING_URL 2>/dev/null || true)"
if [[ -n "${safe_booking_url}" ]]; then
  check_url "public_booking" "${safe_booking_url}" '^(200|301|302|307|308)$' || status=1
else
  echo "public_booking: skipped no safe synthetic booking URL declared"
fi

exit "${status}"
