#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
ENV_FILE="${BASE}/.env"
BACKUP_DIR="${BASE}/backups"
RESTORE_MARKER="${BACKUP_DIR}/.last-restore-preview"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env}"

file="${1:-}"
if [ -z "${file}" ]; then
  file="$(ls -1t "${BACKUP_DIR}"/*.enc 2>/dev/null | head -n1 || true)"
fi

if [ -z "${file}" ] || [ ! -f "${file}" ]; then
  echo "No backup file found." >&2
  exit 1
fi

started_epoch="$(date -u +%s)"
artifact_name="$(basename "${file}")"
artifact_sha256="$(sha256sum "${file}" | awk '{print $1}')"

echo "Testing restore for: ${file}"
set +o pipefail
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "${file}" | gunzip -c | head -n 20
set -o pipefail
finished_epoch="$(date -u +%s)"
duration_seconds="$((finished_epoch - started_epoch))"
restore_timestamp="$(date -u -d "@${finished_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
cat > "${RESTORE_MARKER}" <<EOF
RESTORE_PREVIEW_STATUS:ready
RESTORE_PREVIEW_AT:${restore_timestamp}
RESTORE_PREVIEW_ARTIFACT:${artifact_name}
RESTORE_PREVIEW_SHA256:${artifact_sha256}
RESTORE_PREVIEW_DURATION_SECONDS:${duration_seconds}
EOF
echo "Restore test complete (preview only)."
