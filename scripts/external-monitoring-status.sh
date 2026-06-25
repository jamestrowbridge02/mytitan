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

url_host() {
  printf '%s' "$1" | sed -E 's#^[a-z]+://([^/:]+).*$#\1#'
}

check_url() {
  local url="$1"
  if [[ -z "${url}" ]]; then
    printf 'not_configured'
    return 0
  fi
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${url}" 2>/dev/null || true)"
  case "${code}" in
    200|301|302|307|308) printf 'ready' ;;
    000|'') printf 'unknown' ;;
    *) printf 'needs_setup' ;;
  esac
}

describe_url_check() {
  local url="$1"
  local label="$2"
  local state
  state="$(check_url "${url}")"
  echo "${label}_STATUS:${state}"
  echo "${label}_URL:${url:-not_configured}"
}

app_url="$(read_env_value APP_PUBLIC_URL 2>/dev/null || true)"
api_url="$(read_env_value API_PUBLIC_URL 2>/dev/null || true)"
marketing_url="$(read_env_value MARKETING_PUBLIC_URL 2>/dev/null || true)"
if [[ -z "${marketing_url}" && -n "${app_url}" ]]; then
  marketing_url="$(printf '%s' "${app_url}" | sed -E 's#://app\.#://#')"
fi

nginx_status="unknown"
nginx_detail="systemctl is unavailable on this host."
if command -v systemctl >/dev/null 2>&1; then
  enabled="$(systemctl is-enabled nginx 2>&1 || true)"
  active="$(systemctl is-active nginx 2>&1 || true)"
  if printf '%s %s' "${enabled}" "${active}" | grep -qiE 'Failed to connect to bus|System has not been booted'; then
    nginx_status="unknown"
    nginx_detail="systemctl cannot inspect nginx through the current service manager connection."
  elif [[ "${enabled}" == "enabled" && "${active}" == "active" ]]; then
    nginx_status="ready"
    nginx_detail="nginx is enabled and active."
  else
    nginx_status="needs_setup"
    nginx_detail="nginx is not both enabled and active."
  fi
fi

tls_status="unknown"
tls_detail="APP_PUBLIC_URL is not configured."
tls_expiry="unknown"
if [[ -n "${app_url}" ]]; then
  app_host="$(url_host "${app_url}")"
  tls_expiry="$( (openssl s_client -connect "${app_host}:443" -servername "${app_host}" </dev/null 2>/dev/null || true) | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//' || true)"
  if [[ -n "${tls_expiry}" ]]; then
    tls_status="ready"
    tls_detail="The public app TLS certificate returned an expiry date."
  else
    tls_status="unknown"
    tls_detail="Could not read the public app TLS certificate expiry."
  fi
fi

external_monitor_status="not_configured"
external_monitor_detail="No external uptime monitor is declared. Add a non-secret monitor name or URL in the host environment."
external_monitor_name="$(read_env_value MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME 2>/dev/null || true)"
external_monitor_url="$(read_env_value MYTITAN_EXTERNAL_UPTIME_MONITOR_URL 2>/dev/null || true)"
external_monitor_state="$(read_env_value MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE 2>/dev/null || true)"
external_monitor_provider="$(read_env_value MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER 2>/dev/null || true)"
if [[ -n "${external_monitor_name}" || -n "${external_monitor_url}" || -n "${external_monitor_provider}" ]]; then
  case "$(printf '%s' "${external_monitor_state}" | tr '[:upper:]' '[:lower:]')" in
    healthy)
      external_monitor_status="healthy"
      external_monitor_detail="A non-secret external uptime monitor is declared and marked healthy by operator-controlled readiness state."
      ;;
    degraded)
      external_monitor_status="degraded"
      external_monitor_detail="A non-secret external uptime monitor is declared, but the operator-controlled readiness state is degraded."
      ;;
    verifying)
      external_monitor_status="verifying"
      external_monitor_detail="A non-secret external uptime monitor is declared and waiting for verification evidence."
      ;;
    configured|"")
      external_monitor_status="configured"
      external_monitor_detail="A non-secret external uptime monitor is declared. Set MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE=verifying, healthy, or degraded after provider verification."
      ;;
    *)
      external_monitor_status="configured"
      external_monitor_detail="A non-secret external uptime monitor is declared, but the readiness state was not recognised. Use configured, verifying, healthy, or degraded."
      ;;
  esac
fi

echo "STATUS:ready"
echo "DETAIL:Host-visible public URL, nginx, and TLS checks ran without exposing secrets."
describe_url_check "${app_url%/}/login" "APP"
describe_url_check "${api_url%/}/health" "API"
describe_url_check "${marketing_url%/}" "MARKETING"
echo "NGINX_STATUS:${nginx_status}"
echo "NGINX_DETAIL:${nginx_detail}"
echo "TLS_STATUS:${tls_status}"
echo "TLS_EXPIRY:${tls_expiry}"
echo "TLS_DETAIL:${tls_detail}"
echo "EXTERNAL_MONITOR_STATUS:${external_monitor_status}"
echo "EXTERNAL_MONITOR_DETAIL:${external_monitor_detail}"
echo "EXTERNAL_MONITOR_PROVIDER:${external_monitor_provider:+configured}"
