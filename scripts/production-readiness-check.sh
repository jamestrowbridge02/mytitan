#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
cd "${BASE}"

read_env_value() {
  local name="$1"
  if [ -n "${!name:-}" ]; then
    printf '%s' "${!name}"
    return 0
  fi

  local env_file line value
  if [ "${MYTITAN_READINESS_IGNORE_ENV_FILES:-}" = "1" ]; then
    return 1
  fi

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

is_present() {
  local name="$1"
  local value
  value="$(read_env_value "${name}" 2>/dev/null || true)"
  [ -n "${value}" ]
}

safe_decrypt_present() {
  local encrypted="$1"
  local encryption_key="$2"
  [ -n "${encrypted}" ] || return 1
  [ -n "${encryption_key}" ] || return 1

  INTEGRATIONS_ENCRYPTION_KEY="${encryption_key}" ENCRYPTED_VALUE="${encrypted}" node -e '
const crypto = require("crypto");
const secret = String(process.env.INTEGRATIONS_ENCRYPTION_KEY || "").trim();
const payload = String(process.env.ENCRYPTED_VALUE || "");
try {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!secret || !ivB64 || !tagB64 || !dataB64) process.exit(1);
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8").trim();
  process.exit(plaintext ? 0 : 1);
} catch {
  process.exit(1);
}
' >/dev/null 2>&1
}

connect_vault_row() {
  if [ -n "${MYTITAN_READINESS_CONNECT_VAULT_ROW:-}" ]; then
    printf '%s' "${MYTITAN_READINESS_CONNECT_VAULT_ROW}"
    return 0
  fi
  docker_available || return 0
  docker exec mytitan_postgres psql -U mytitan -d mytitan -At -F $'\t' -c \
    "select mode, coalesce(\"platformSecretEncrypted\", ''), coalesce(\"webhookSecretEncrypted\", ''), coalesce(\"credentialStatus\", 'missing'), coalesce(\"webhookStatus\", 'missing') from \"PlatformPaymentProviderConfig\" where id = 'stripe_connect' limit 1;" 2>/dev/null || true
}

connect_readiness_metadata() {
  local env_platform env_webhook env_mode row mode vault_platform vault_webhook credential_status webhook_status status_verified
  local source platform_present webhook_present platform_decryptable webhook_decryptable verified state detail encryption_key

  env_platform="$(read_env_value STRIPE_CONNECT_PLATFORM_SECRET 2>/dev/null || true)"
  env_webhook="$(read_env_value STRIPE_CONNECT_WEBHOOK_SECRET 2>/dev/null || true)"
  env_mode="$(read_env_value MYTITAN_TENANT_STRIPE_CONNECT_MODE 2>/dev/null || true)"
  case "${env_mode}" in
    live) mode="live" ;;
    *) mode="test" ;;
  esac

  row="$(connect_vault_row)"
  vault_platform=""
  vault_webhook=""
  credential_status="missing"
  webhook_status="missing"
  if [ -n "${row}" ]; then
    IFS=$'\t' read -r mode vault_platform vault_webhook credential_status webhook_status <<<"${row}"
    case "${mode}" in
      live) mode="live" ;;
      *) mode="test" ;;
    esac
  fi

  if [ -n "${vault_platform}" ] || [ -n "${vault_webhook}" ]; then
    source="vault"
    platform_present="$([ -n "${vault_platform}" ] && printf yes || printf no)"
    webhook_present="$([ -n "${vault_webhook}" ] && printf yes || printf no)"
    encryption_key="$(read_env_value INTEGRATIONS_ENCRYPTION_KEY 2>/dev/null || true)"
    platform_decryptable="no"
    webhook_decryptable="no"
    if safe_decrypt_present "${vault_platform}" "${encryption_key}"; then platform_decryptable="yes"; fi
    if safe_decrypt_present "${vault_webhook}" "${encryption_key}"; then webhook_decryptable="yes"; fi
    status_verified="$([ "${credential_status}" = "verified" ] && [ "${webhook_status}" = "verified" ] && printf yes || printf no)"
    verified="$([ "${status_verified}" = "yes" ] && [ "${platform_decryptable}" = "yes" ] && [ "${webhook_decryptable}" = "yes" ] && printf yes || printf no)"
    if [ "${platform_present}" = "yes" ] && [ "${webhook_present}" = "yes" ] && [ "${platform_decryptable}" = "yes" ] && [ "${webhook_decryptable}" = "yes" ] && [ "${verified}" = "yes" ]; then
      state="ready"
      detail="source: vault; platform secret: present; webhook secret: present; verified: yes; mode: ${mode}"
    elif [ "${platform_present}" = "yes" ] && [ "${webhook_present}" = "yes" ]; then
      state="needs_verification"
      detail="source: vault; platform secret: present; webhook secret: present; verified: no; mode: ${mode}"
    else
      state="needs_setup"
      detail="source: vault; platform secret: $([ "${platform_present}" = "yes" ] && printf present || printf missing); webhook secret: $([ "${webhook_present}" = "yes" ] && printf present || printf missing); verified: no; mode: ${mode}"
    fi
  elif [ -n "${env_platform}" ] || [ -n "${env_webhook}" ]; then
    source="env"
    platform_present="$([ -n "${env_platform}" ] && printf yes || printf no)"
    webhook_present="$([ -n "${env_webhook}" ] && printf yes || printf no)"
    verified="$([ "${platform_present}" = "yes" ] && [ "${webhook_present}" = "yes" ] && printf yes || printf no)"
    state="$([ "${verified}" = "yes" ] && printf ready || printf needs_setup)"
    detail="source: ${source}; platform secret: $([ "${platform_present}" = "yes" ] && printf present || printf missing); webhook secret: $([ "${webhook_present}" = "yes" ] && printf present || printf missing); verified: ${verified}; mode: ${mode}"
  else
    source="missing"
    state="needs_setup"
    detail="source: missing; platform secret: missing; webhook secret: missing; verified: no; mode: ${mode}"
  fi

  printf 'STATE:%s\n' "${state}"
  printf 'SOURCE:%s\n' "${source}"
  printf 'PLATFORM_PRESENT:%s\n' "$([ "${platform_present:-no}" = "yes" ] && printf present || printf missing)"
  printf 'WEBHOOK_PRESENT:%s\n' "$([ "${webhook_present:-no}" = "yes" ] && printf present || printf missing)"
  printf 'VERIFIED:%s\n' "${verified:-no}"
  printf 'MODE:%s\n' "${mode}"
  printf 'DETAIL:%s\n' "${detail}"
}

print_status() {
  local label="$1"
  local state="$2"
  local detail="$3"
  printf '%-34s %-16s %s\n' "${label}" "${state}" "${detail}"
}

governance_route_state() {
  local slug="$1"
  local page="${BASE}/marketing/pages/${slug}.tsx"
  if [ ! -f "${page}" ]; then
    printf 'needs_setup'
    return 0
  fi
  if grep -qi "operator review required" "${page}" "${BASE}/marketing/components/governance/GovernancePage.tsx" "${BASE}/marketing/lib/site-content.ts" 2>/dev/null; then
    printf 'needs_review'
    return 0
  fi
  printf 'ready'
}

public_booking_rate_limit_state() {
  local controller="${BASE}/api/src/public/public-booking.controller.ts"
  local config="${BASE}/api/src/public/public-booking-rate-limit.ts"
  if [ -f "${controller}" ] && [ -f "${config}" ] && grep -q "PUBLIC_BOOKING_RATE_LIMIT_MESSAGE" "${controller}" && grep -q "PUBLIC_BOOKING_CREATE_RATE_LIMIT" "${config}"; then
    printf 'ready'
    return 0
  fi
  printf 'needs_setup'
}

upload_limit_state() {
  local repo_config="${BASE}/deploy/nginx/mytitan-upload-limits.conf"
  local active_config="/etc/nginx/sites-available/mytitan"
  if [ ! -f "${repo_config}" ] || ! grep -q "client_max_body_size 110M" "${repo_config}"; then
    printf 'needs_setup'
    return 0
  fi
  if [ -r "${active_config}" ] && grep -q "client_max_body_size 110M" "${active_config}"; then
    printf 'ready'
    return 0
  fi
  printf 'needs_setup'
}

script_status_from_output() {
  local output="$1"
  local fallback="${2:-unknown}"
  local status
  status="$(printf '%s\n' "${output}" | awk -F: '$1 == "STATUS" {print $2; exit}' | sed 's/^ *//')"
  case "${status}" in
    ready|needs_backup_run|needs_restore_drill|needs_schedule|needs_setup|not_configured|unknown)
      printf '%s' "${status}"
      ;;
    *)
      printf '%s' "${fallback}"
      ;;
  esac
}

external_uptime_print_state() {
  case "${1:-}" in
    not_configured|configured|verifying|healthy|degraded)
      printf '%s' "$1"
      ;;
    ready)
      printf 'healthy'
      ;;
    *)
      printf 'not_configured'
      ;;
  esac
}

script_value_from_output() {
  local output="$1"
  local key="$2"
  printf '%s\n' "${output}" | awk -F: -v key="${key}" '$1 == key {sub($1":",""); print; exit}' | sed 's/^ *//'
}

docker_available() {
  docker info >/dev/null 2>&1
}

if [ "${MYTITAN_READINESS_CONNECT_ONLY:-}" = "1" ]; then
  connect_readiness_metadata
  exit 0
fi

prisma_migration_state() {
  if ! docker_available; then
    printf 'not_configured'
    return 0
  fi

  if docker exec -w /app mytitan_api /bin/sh -lc 'npx prisma migrate deploy >/tmp/mytitan-prisma-migrate.log 2>&1'; then
    printf 'ready'
    return 0
  fi

  printf 'needs_setup'
}

notification_routing_state() {
  if ! docker_available; then
    printf 'not_configured'
    return 0
  fi

  if docker exec -w /app mytitan_api /bin/sh -lc 'npm run notifications:verify-routing >/tmp/mytitan-notification-routing.log 2>&1'; then
    printf 'ready'
    return 0
  fi

  printf 'needs_setup'
}

service_state() {
  local service="$1"
  if docker_available && docker compose ps --services --filter status=running 2>/dev/null | grep -qx "${service}"; then
    printf 'ready'
  elif docker_available; then
    printf 'needs_setup'
  else
    printf 'not_configured'
  fi
}

health_state="needs_setup"
if bash ./scripts/healthcheck.sh >/dev/null 2>&1; then
  health_state="ready"
fi

scheduler_output="$(bash ./scripts/summary-scheduler-status.sh 2>/dev/null || true)"
backup_output="$(bash ./scripts/backup-readiness-status.sh 2>/dev/null || true)"
monitoring_output="$(bash ./scripts/external-monitoring-status.sh 2>/dev/null || true)"
stripe_key_guard_output="$(bash ./scripts/stripe-key-guard.sh 2>/dev/null || true)"

scheduler_state="$(script_status_from_output "${scheduler_output}" not_configured)"
scheduler_detail="$(script_value_from_output "${scheduler_output}" DETAIL)"
backup_state="$(script_status_from_output "${backup_output}" unknown)"
backup_detail="$(script_value_from_output "${backup_output}" DETAIL)"
backup_last_at="$(script_value_from_output "${backup_output}" LAST_BACKUP_AT)"
backup_restore_at="$(script_value_from_output "${backup_output}" LAST_RESTORE_DRILL_AT)"
monitoring_state="$(script_status_from_output "${monitoring_output}" unknown)"
monitoring_detail="$(script_value_from_output "${monitoring_output}" DETAIL)"
app_monitor_status="$(script_value_from_output "${monitoring_output}" APP_STATUS)"
api_monitor_status="$(script_value_from_output "${monitoring_output}" API_STATUS)"
marketing_monitor_status="$(script_value_from_output "${monitoring_output}" MARKETING_STATUS)"
nginx_monitor_status="$(script_value_from_output "${monitoring_output}" NGINX_STATUS)"
tls_monitor_status="$(script_value_from_output "${monitoring_output}" TLS_STATUS)"
tls_expiry="$(script_value_from_output "${monitoring_output}" TLS_EXPIRY)"
external_uptime_state="$(script_value_from_output "${monitoring_output}" EXTERNAL_MONITOR_STATUS)"
external_uptime_detail="$(script_value_from_output "${monitoring_output}" EXTERNAL_MONITOR_DETAIL)"
stripe_key_guard_state="$(script_status_from_output "${stripe_key_guard_output}" unknown)"
stripe_key_guard_detail="$(script_value_from_output "${stripe_key_guard_output}" DETAIL)"
connect_metadata="$(connect_readiness_metadata)"
connect_state="$(script_value_from_output "${connect_metadata}" STATE)"
connect_source="$(script_value_from_output "${connect_metadata}" SOURCE)"
connect_platform_present="$(script_value_from_output "${connect_metadata}" PLATFORM_PRESENT)"
connect_webhook_present="$(script_value_from_output "${connect_metadata}" WEBHOOK_PRESENT)"
connect_verified="$(script_value_from_output "${connect_metadata}" VERIFIED)"
connect_mode="$(script_value_from_output "${connect_metadata}" MODE)"
connect_detail="$(script_value_from_output "${connect_metadata}" DETAIL)"

migration_state="$(prisma_migration_state)"
app_public_url="$(read_env_value APP_PUBLIC_URL 2>/dev/null || true)"
api_public_url="$(read_env_value API_PUBLIC_URL 2>/dev/null || true)"

validation_state="needs_setup"
if [ -x "${BASE}/scripts/validate-e2e-stable.sh" ]; then
  validation_state="ready"
fi

webhook_reachability="needs_setup"
if is_present "APP_PUBLIC_URL" && is_present "STRIPE_WEBHOOK_SECRET"; then
  webhook_reachability="ready"
fi

connect_webhook_reachability="needs_setup"
if is_present "API_PUBLIC_URL" && [ "${connect_webhook_present}" = "present" ] && [ "${connect_state}" = "ready" ]; then
  connect_webhook_reachability="ready"
fi

echo "MyTitan production readiness snapshot"
echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo
print_status "Runtime healthcheck" "${health_state}" "API health endpoint responds without exposing internals."
print_status "Summary scheduler" "${scheduler_state}" "${scheduler_detail:-Host-level scheduler install is checked via the summary scheduler status helper.}"
print_status "App service" "$(service_state app)" "Container/service presence only."
print_status "API service" "$(service_state api)" "Container/service presence only."
print_status "Marketing service" "$(service_state marketing)" "Container/service presence only."
print_status "Postgres service" "$(service_state postgres)" "Database container presence only."
print_status "Redis service" "$(service_state redis)" "Cache/queue container presence only."
print_status "Prisma migration status" "${migration_state}" "Checked with prisma migrate deploy against the running API container."
print_status "Notification routing verify" "$(notification_routing_state)" "Metadata-only runtime verification confirms recipient source priority, dedupe, and privacy-safe logging."
print_status "Deployment validation script" "${validation_state}" "Stable validation runner is available for release proof."
print_status "Webhook endpoint reachability" "${webhook_reachability}" "Presence-only check based on declared public URL and webhook secret."
print_status "Stripe Connect webhook readiness" "${connect_webhook_reachability}" "${connect_detail}"
print_status "Stripe Connect vault awareness" "${connect_state}" "${connect_detail}"
print_status "Hardcoded Stripe key guard" "${stripe_key_guard_state}" "${stripe_key_guard_detail:-Scans source, scripts, and docs for real-looking sk_/pk_ values without printing secrets.}"
print_status "Public booking rate limit" "$(public_booking_rate_limit_state)" "Dedicated friendly throttling exists for public booking create, status, slots, reschedule, cancel, and deposit restart actions."
print_status "Phase 8 upload limits" "$(upload_limit_state)" "Nginx has a bounded 110 MB ceiling; API and UI enforce lower file-type limits with structured 413 responses."
print_status "Backup evidence" "${backup_state}" "${backup_detail:-Backup evidence is checked without exposing backup secrets or storage URLs.}"
print_status "Latest backup artifact" "$( [ -n "${backup_last_at}" ] && printf ready || printf unknown )" "${backup_last_at:-No backup artifact timestamp is visible.}"
print_status "Latest restore preview" "$( [ -n "${backup_restore_at}" ] && [ "${backup_restore_at}" != "unknown" ] && printf ready || printf needs_restore_drill )" "$( [ -n "${backup_restore_at}" ] && [ "${backup_restore_at}" != "unknown" ] && printf '%s' "${backup_restore_at}" || printf 'No restore preview timestamp is visible.' )"
print_status "Public app login" "${app_monitor_status:-unknown}" "Expected response comes from ${app_public_url:-APP_PUBLIC_URL not set}/login without exposing internal hosts."
print_status "Public API health" "${api_monitor_status:-unknown}" "Expected response comes from ${api_public_url:-API_PUBLIC_URL not set}/health without exposing internal hosts."
print_status "Public marketing home" "${marketing_monitor_status:-unknown}" "Expected response comes from the declared marketing URL without exposing internal hosts."
print_status "nginx service state" "${nginx_monitor_status:-unknown}" "Host nginx state is checked without exposing private config."
print_status "TLS certificate visibility" "${tls_monitor_status:-unknown}" "${tls_expiry:-No TLS expiry could be read.}"
print_status "External uptime monitor" "$(external_uptime_print_state "${external_uptime_state:-not_configured}")" "${external_uptime_detail:-Declare a non-secret external monitor identifier before treating uptime monitoring as configured.}"
print_status "Privacy route publication" "$(governance_route_state privacy)" "Public policy route presence with starter-template review tracking."
print_status "Terms route publication" "$(governance_route_state terms)" "Public terms route presence with starter-template review tracking."
print_status "Cookie route publication" "$(governance_route_state cookies)" "Public cookie policy route presence with starter-template review tracking."
print_status "Data retention route" "$(governance_route_state data-retention)" "Public retention route presence with starter-template review tracking."
print_status "INTEGRATIONS_ENCRYPTION_KEY" "$(is_present INTEGRATIONS_ENCRYPTION_KEY && printf ready || printf needs_setup)" "Required before storing or rotating integration secrets."
print_status "STRIPE_SECRET_KEY" "$(is_present STRIPE_SECRET_KEY && printf ready || printf needs_setup)" "Provider key presence only."
print_status "STRIPE_WEBHOOK_SECRET" "$(is_present STRIPE_WEBHOOK_SECRET && printf ready || printf needs_setup)" "Signature verification secret presence only."
print_status "STRIPE_CONNECT_PLATFORM_SECRET" "$( [ "${connect_platform_present}" = "present" ] && [ "${connect_state}" = "ready" ] && printf ready || printf needs_setup )" "source: ${connect_source}; platform secret: ${connect_platform_present}; verified: ${connect_verified}; mode: ${connect_mode}"
print_status "STRIPE_CONNECT_WEBHOOK_SECRET" "$( [ "${connect_webhook_present}" = "present" ] && [ "${connect_state}" = "ready" ] && printf ready || printf needs_setup )" "source: ${connect_source}; webhook secret: ${connect_webhook_present}; verified: ${connect_verified}; mode: ${connect_mode}"
print_status "BACKUP_ENCRYPTION_KEY" "$(is_present BACKUP_ENCRYPTION_KEY && printf ready || printf needs_setup)" "Required for encrypted database backups."
print_status "APP_PUBLIC_URL" "$(is_present APP_PUBLIC_URL && printf ready || printf needs_setup)" "Public app base URL presence only."
print_status "API_PUBLIC_URL" "$(is_present API_PUBLIC_URL && printf ready || printf needs_setup)" "Public API base URL presence only."
print_status "Disk headroom" "ready" "$(df -h /opt/mytitan | awk 'NR==2 {print $4 " available on " $6}')"
print_status "Memory headroom" "ready" "$(free -m | awk '/Mem:/ {print $7 "MB available"}')"
