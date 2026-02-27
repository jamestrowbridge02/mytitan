#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${SHADOW_MIGRATE_IMAGE:-postgres:16}"
CONTAINER="${SHADOW_MIGRATE_CONTAINER:-codex_shadow_postgres_$RANDOM}"
PORT="${SHADOW_MIGRATE_PORT:-54329}"
USER="${SHADOW_MIGRATE_USER:-shadow}"
PASSWORD="${SHADOW_MIGRATE_PASSWORD:-shadowpass}"
MAIN_DB="${SHADOW_MIGRATE_DB:-shadow_mytitan}"
SHADOW_DB="${SHADOW_MIGRATE_SHADOW_DB:-shadow_mytitan_shadow}"

cleanup() {
  if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
    docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "Starting ephemeral PostgreSQL (${IMAGE}) on port ${PORT}..."
docker run -d --name "${CONTAINER}" -e POSTGRES_USER="${USER}" -e POSTGRES_PASSWORD="${PASSWORD}" -e POSTGRES_DB="${MAIN_DB}" -p "${PORT}":5432 "${IMAGE}" >/dev/null

echo "Waiting for PostgreSQL to accept connections..."
until docker exec "${CONTAINER}" pg_isready -U "${USER}" >/dev/null 2>&1; do
  sleep 0.5
done

echo "Creating shadow database ${SHADOW_DB}..."
docker exec "${CONTAINER}" psql -U "${USER}" -d "${MAIN_DB}" -c "CREATE DATABASE \"${SHADOW_DB}\";" >/dev/null

export DATABASE_URL="postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${MAIN_DB}"
export SHADOW_DATABASE_URL="postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${SHADOW_DB}"

echo "Running prisma migrate deploy against temp database..."
cd "${ROOT_DIR}"
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "Shadow migration check succeeded."
