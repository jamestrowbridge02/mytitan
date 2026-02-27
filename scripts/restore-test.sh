#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
ENV_FILE="${BASE}/.env"
BACKUP_DIR="${BASE}/backups"

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

echo "Testing restore for: ${file}"
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "${file}" | gunzip -c | head -n 20
echo "Restore test complete (preview only)."
