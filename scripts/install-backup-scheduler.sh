#!/usr/bin/env bash
set -euo pipefail

BASE="${MYTITAN_BASE_DIR:-/opt/mytitan}"
ENABLE_TIMERS="${ENABLE_TIMERS:-0}"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is required to install the MyTitan backup timer." >&2
  exit 1
fi

cat > /etc/systemd/system/mytitan-backup.service <<SERVICE
[Unit]
Description=MyTitan encrypted database backup
Wants=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=${BASE}
ExecStart=/usr/bin/env bash ${BASE}/scripts/backup.sh
SERVICE

cat > /etc/systemd/system/mytitan-backup.timer <<TIMER
[Unit]
Description=Run MyTitan encrypted database backup daily

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
Unit=mytitan-backup.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
if [[ "${ENABLE_TIMERS}" == "1" ]]; then
  systemctl enable --now mytitan-backup.timer
  mkdir -p "${BASE}/backups"
  {
    echo "BACKUP_TIMER_ENABLED_AT:$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "BACKUP_TIMER_UNIT:mytitan-backup.timer"
    echo "BACKUP_TIMER_STATUS:ready"
  } > "${BASE}/backups/.backup-scheduler-ready"
  echo "Installed and enabled MyTitan backup timer."
else
  echo "Installed MyTitan backup timer. Run ENABLE_TIMERS=1 ${BASE}/scripts/install-backup-scheduler.sh to enable it."
fi
