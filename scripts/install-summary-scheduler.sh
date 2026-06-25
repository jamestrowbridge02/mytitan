#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_DIR="${ROOT_DIR}/deploy/systemd"
TARGET_DIR="/etc/systemd/system"
ENABLE_TIMERS="${ENABLE_TIMERS:-0}"
ENV_LOCAL="${ROOT_DIR}/.env.local"

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

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root to install MyTitan summary scheduler units." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not available on this host." >&2
  exit 1
fi

install -m 0644 "${SYSTEMD_DIR}/mytitan-summary@.service" "${TARGET_DIR}/mytitan-summary@.service"
for cadence in daily weekly monthly quarterly annual; do
  install -m 0644 "${SYSTEMD_DIR}/mytitan-summary-${cadence}.timer" "${TARGET_DIR}/mytitan-summary-${cadence}.timer"
done

systemctl daemon-reload

if [[ "${ENABLE_TIMERS}" == "1" ]]; then
  for cadence in daily weekly monthly quarterly annual; do
    systemctl enable --now "mytitan-summary-${cadence}.timer"
  done
  upsert_env_value "MYTITAN_SUMMARY_SCHEDULER_CONFIGURED" "1"
  echo "Installed and enabled MyTitan summary timers."
else
  echo "Installed MyTitan summary timers. Enable them with:"
  echo "  sudo systemctl enable --now mytitan-summary-daily.timer"
  echo "  sudo systemctl enable --now mytitan-summary-weekly.timer"
  echo "  sudo systemctl enable --now mytitan-summary-monthly.timer"
  echo "  sudo systemctl enable --now mytitan-summary-quarterly.timer"
  echo "  sudo systemctl enable --now mytitan-summary-annual.timer"
fi
