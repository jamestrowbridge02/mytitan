#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
ENV_FILE="${BASE}/.env"
BACKUP_DIR="${BASE}/backups"
BACKUP_MARKER="${BACKUP_DIR}/.last-successful-backup"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set in .env}"

mkdir -p "${BACKUP_DIR}"

ts="$(date +%Y%m%d_%H%M%S)"
plain="${BACKUP_DIR}/mytitan_${ts}.sql"
gz="${plain}.gz"
enc="${gz}.enc"

echo "Creating Postgres dump..."
docker exec mytitan_postgres pg_dump -U mytitan mytitan > "${plain}"

gzip "${plain}"

echo "Encrypting backup..."
openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "${gz}" -out "${enc}"
rm -f "${gz}"

echo "Rotating backups older than 30 days..."
find "${BACKUP_DIR}" -type f -name "*.enc" -mtime +30 -delete

date -u +"%Y-%m-%dT%H:%M:%SZ ${enc}" > "${BACKUP_MARKER}"

echo "Backup complete: ${enc}"
