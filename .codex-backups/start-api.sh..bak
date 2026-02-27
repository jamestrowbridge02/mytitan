#!/usr/bin/env bash
set -euo pipefail

SCHEMA_PATH="prisma/schema.prisma"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is required but not set." >&2
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "Error: JWT_SECRET is required but not set." >&2
  exit 1
fi

if [[ "${RUN_MIGRATIONS:-}" == "true" ]]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy --schema="${SCHEMA_PATH}"
else
  echo "Skipping Prisma migrations (set RUN_MIGRATIONS=true to enable)."
fi

if npm run | grep -q "start:prod"; then
  echo "Starting API with start:prod..."
  exec npm run start:prod
fi

echo "start:prod script not found, starting API with start..."
exec npm run start
