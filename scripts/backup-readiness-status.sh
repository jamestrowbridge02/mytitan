#!/usr/bin/env bash
set -euo pipefail

BASE="${MYTITAN_BASE_DIR:-/opt/mytitan}"
BACKUP_DIR="${BASE}/backups"
RESTORE_MARKER="${BACKUP_DIR}/.last-restore-preview"
BACKUP_MARKER="${BACKUP_DIR}/.last-successful-backup"
SCHEDULER_MARKER="${BACKUP_DIR}/.backup-scheduler-ready"
NOW_EPOCH="$(date -u +%s)"
RECENT_BACKUP_SECONDS="${MYTITAN_BACKUP_MAX_AGE_SECONDS:-129600}"
RESTORE_DRILL_MAX_DAYS="${MYTITAN_RESTORE_DRILL_MAX_DAYS:-90}"

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "STATUS:unknown"
  echo "DETAIL:Backup evidence directory is not available from this runtime."
  exit 1
fi

latest_backup=""
if compgen -G "${BACKUP_DIR}/*.enc" >/dev/null 2>&1; then
  latest_backup="$(ls -1t "${BACKUP_DIR}"/*.enc 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "${latest_backup}" ]]; then
  echo "STATUS:needs_backup_run"
  echo "DETAIL:No encrypted backup artifact is available yet."
  exit 1
fi

latest_backup_epoch="$(stat -c %Y "${latest_backup}")"
latest_backup_at="$(date -u -d "@${latest_backup_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
latest_backup_name="$(basename "${latest_backup}")"
latest_backup_size_bytes="$(stat -c %s "${latest_backup}")"
backup_age_seconds=$((NOW_EPOCH - latest_backup_epoch))

schedule_status="needs_schedule"
schedule_detail="No recent recurring backup cadence was detected from the visible artifacts."
backup_timer_marker_at=""
if [[ -f "${SCHEDULER_MARKER}" ]]; then
  marker_status="$(sed -n 's/^BACKUP_TIMER_STATUS://p' "${SCHEDULER_MARKER}" | head -n 1 | sed 's/^ *//')"
  backup_timer_marker_at="$(sed -n 's/^BACKUP_TIMER_ENABLED_AT://p' "${SCHEDULER_MARKER}" | head -n 1 | sed 's/^ *//')"
  if [[ "${marker_status}" == "ready" ]]; then
    schedule_status="ready"
    schedule_detail="Host marker confirms mytitan-backup.timer was installed and enabled${backup_timer_marker_at:+ at ${backup_timer_marker_at}}."
  fi
fi
if command -v systemctl >/dev/null 2>&1; then
  backup_timer_enabled="$(systemctl is-enabled mytitan-backup.timer 2>&1 || true)"
  backup_timer_active="$(systemctl is-active mytitan-backup.timer 2>&1 || true)"
  if [[ "${backup_timer_enabled}" == "enabled" && "${backup_timer_active}" == "active" ]]; then
    schedule_status="ready"
    schedule_detail="mytitan-backup.timer is enabled and active on this host."
  elif printf '%s %s' "${backup_timer_enabled}" "${backup_timer_active}" | grep -qiE 'Failed to connect to bus|System has not been booted|Operation not permitted'; then
    schedule_detail="systemctl cannot inspect mytitan-backup.timer through the current service manager connection."
  else
    schedule_detail="mytitan-backup.timer is not enabled and active. Run sudo ENABLE_TIMERS=1 /opt/mytitan/scripts/install-backup-scheduler.sh."
  fi
fi
recent_artifacts=()
while IFS= read -r path; do
  recent_artifacts+=("${path}")
done < <(ls -1t "${BACKUP_DIR}"/*.enc 2>/dev/null | head -n 3 || true)

if [[ "${schedule_status}" != "ready" && "${#recent_artifacts[@]}" -ge 2 ]]; then
  first_epoch="$(stat -c %Y "${recent_artifacts[0]}")"
  second_epoch="$(stat -c %Y "${recent_artifacts[1]}")"
  delta=$((first_epoch - second_epoch))
  if [[ "${delta}" -ge 79200 && "${delta}" -le 129600 ]]; then
    schedule_status="ready"
    schedule_detail="Recent backup artifacts show a roughly daily cadence."
  else
    schedule_detail="Backup artifacts exist, but the last visible cadence is not close to daily."
  fi
fi

restore_status="needs_restore_drill"
restore_detail="No recorded restore preview is available yet."
restore_at=""
restore_artifact=""
restore_sha256=""
restore_duration=""
read_marker_value() {
  local key="$1"
  sed -n "s/^${key}://p" "${RESTORE_MARKER}" 2>/dev/null | head -n 1 | sed 's/^ *//'
}
if [[ -f "${RESTORE_MARKER}" ]]; then
  restore_at="$(read_marker_value RESTORE_PREVIEW_AT || true)"
  restore_artifact="$(read_marker_value RESTORE_PREVIEW_ARTIFACT || true)"
  restore_sha256="$(read_marker_value RESTORE_PREVIEW_SHA256 || true)"
  restore_duration="$(read_marker_value RESTORE_PREVIEW_DURATION_SECONDS || true)"
  if [[ -z "${restore_at}" ]]; then
    restore_epoch="$(stat -c %Y "${RESTORE_MARKER}")"
    restore_at="$(date -u -d "@${restore_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
  else
    restore_epoch="$(date -u -d "${restore_at}" +%s 2>/dev/null || stat -c %Y "${RESTORE_MARKER}")"
  fi
  restore_age_days=$(((NOW_EPOCH - restore_epoch) / 86400))
  if [[ "${restore_age_days}" -le "${RESTORE_DRILL_MAX_DAYS}" ]]; then
    restore_status="ready"
    restore_detail="A recent restore preview marker is present."
  else
    restore_detail="The latest recorded restore preview is older than ${RESTORE_DRILL_MAX_DAYS} days."
  fi
fi

if [[ -f "${BACKUP_MARKER}" ]]; then
  marker_epoch="$(stat -c %Y "${BACKUP_MARKER}")"
  marker_at="$(date -u -d "@${marker_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
else
  marker_at=""
fi

if [[ "${backup_age_seconds}" -gt "${RECENT_BACKUP_SECONDS}" ]]; then
  echo "STATUS:needs_backup_run"
  echo "DETAIL:The latest encrypted backup artifact is older than the allowed freshness window."
elif [[ "${schedule_status}" != "ready" ]]; then
  echo "STATUS:needs_schedule"
  echo "DETAIL:${schedule_detail}"
elif [[ "${restore_status}" != "ready" ]]; then
  echo "STATUS:needs_restore_drill"
  echo "DETAIL:${restore_detail}"
else
  echo "STATUS:ready"
  echo "DETAIL:Recent encrypted backup artifacts and a recent restore preview are both present."
fi

echo "LAST_BACKUP_AT:${latest_backup_at}"
echo "LAST_BACKUP_ARTIFACT:${latest_backup_name}"
echo "LAST_BACKUP_SIZE_BYTES:${latest_backup_size_bytes}"
echo "BACKUP_ENCRYPTION_STATUS:encrypted_aes_256_cbc_pbkdf2"
echo "LAST_BACKUP_MARKER_AT:${marker_at:-unknown}"
echo "SCHEDULE_STATUS:${schedule_status}"
echo "SCHEDULE_DETAIL:${schedule_detail}"
echo "BACKUP_TIMER_MARKER_AT:${backup_timer_marker_at:-unknown}"
echo "LAST_RESTORE_DRILL_AT:${restore_at:-unknown}"
echo "LAST_RESTORE_DRILL_ARTIFACT:${restore_artifact:-unknown}"
echo "LAST_RESTORE_DRILL_SHA256:${restore_sha256:-unknown}"
echo "LAST_RESTORE_DRILL_DURATION_SECONDS:${restore_duration:-unknown}"
echo "RESTORE_STATUS:${restore_status}"
echo "RESTORE_DETAIL:${restore_detail}"
