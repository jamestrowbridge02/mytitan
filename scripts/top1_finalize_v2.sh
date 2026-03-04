#!/usr/bin/env bash
set -euo pipefail

psql_in_pg() {
  # Usage: psql_in_pg "<SQL>"
  docker exec -i mytitan_postgres psql -v ON_ERROR_STOP=1 -U mytitan -d mytitan -At -c "$1"
}

cd /opt/mytitan

TMP_DIR="/opt/mytitan/tmp"
mkdir -p "$TMP_DIR"
TS="$(date -u +%Y%m%d_%H%M%S)"
LOG="$TMP_DIR/top1_finalize_v2_${TS}.log"
EXPL="$TMP_DIR/top1_finalize_v2_${TS}.md"
DBE="$TMP_DIR/top1_db_evidence_${TS}.txt"

exec > >(tee -a "$LOG") 2>&1

echo "==> top1_finalize_v2 @ $TS"
echo "==> branch: $(git branch --show-current)"
echo

docker compose ps

docker exec -w /app mytitan_api /bin/sh -lc "npx prisma migrate deploy"
docker exec -w /app mytitan_api /bin/sh -lc "npx prisma generate"

docker compose build api
docker compose build app
docker compose build marketing

docker compose up -d --force-recreate api app marketing

for i in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || true)"
  if [[ "$code" == "200" ]]; then
    echo "OK: API /health 200"
    break
  fi
  sleep 1
  [[ "$i" != "60" ]] || { echo "FATAL: API not ready"; exit 2; }
done

APP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/dashboard || true)"
echo "APP /dashboard http=$APP_CODE"
[[ "$APP_CODE" == "200" ]] || { echo "FATAL: app not reachable"; exit 2; }

DB_USER="$(docker exec mytitan_api /bin/sh -lc 'echo "${DATABASE_USER:-}"' | tr -d "\r")"
DB_NAME="$(docker exec mytitan_api /bin/sh -lc 'echo "${DATABASE_NAME:-}"' | tr -d "\r")"
DB_USER="${DB_USER:-mytitan}"
DB_NAME="${DB_NAME:-mytitan}"

cat > "$TMP_DIR/_top1_overlap.sql" <<'SQL'
WITH b AS (
  SELECT id, "companyId" AS company_id, "assignedUserId" AS user_id,
         tsrange("startAt","endAt",'[)') AS r
  FROM "Booking"
  WHERE status = 'PLANNED' AND "assignedUserId" IS NOT NULL
),
pairs AS (
  SELECT COUNT(*)::int AS overlaps
  FROM b a
  JOIN b c
    ON a.company_id = c.company_id
   AND a.user_id = c.user_id
   AND a.id < c.id
   AND a.r && c.r
)
SELECT COALESCE(SUM(overlaps),0)::int AS overlap_rows FROM pairs;
SQL

docker cp "$TMP_DIR/_top1_overlap.sql" mytitan_postgres:/tmp/_top1_overlap.sql >/dev/null

{
  echo "==> Booking constraint:"
  docker exec mytitan_postgres /bin/sh -lc \
    "psql -U $DB_USER -d $DB_NAME -Atc \"SELECT conname FROM pg_constraint WHERE conname='booking_no_overlap_company_technician';\""
  echo
  echo "==> Overlap rows:"
  docker exec mytitan_postgres /bin/sh -lc \
    "psql -U $DB_USER -d $DB_NAME -Atf /tmp/_top1_overlap.sql"
} | tee "$DBE"

OVERLAP="$(docker exec mytitan_postgres /bin/sh -lc "psql -U $DB_USER -d $DB_NAME -Atf /tmp/_top1_overlap.sql" | tr -d "\r" | tail -n 1)"
echo "overlap_rows=$OVERLAP"
[[ "${OVERLAP:-0}" == "0" ]] || { echo "FATAL: overlaps exist: $OVERLAP"; exit 3; }

DEV_CODE="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/admin/dev/me || true)"
echo "/admin/dev/me http=$DEV_CODE"
[[ "$DEV_CODE" == "401" ]] || { echo "FATAL: expected 401, got $DEV_CODE"; exit 4; }

COOKIE_JAR="${COOKIE_JAR:-}"
AUTH_BEARER="${AUTH_BEARER:-}"
TENANT_HTTP="401"
if [[ -n "$AUTH_BEARER" ]]; then
  TENANT_HTTP="$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $AUTH_BEARER" http://127.0.0.1:3000/tenant/settings || true)"
elif [[ -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]]; then
  TENANT_HTTP="$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" http://127.0.0.1:3000/tenant/settings || true)"
fi
echo "/tenant/settings http=$TENANT_HTTP"

HTML="$(curl -sS http://127.0.0.1:3001/dashboard/jobs/new || true)"
if echo "$HTML" | grep -q "Wheels Form v1 is off or your primary trade is not WHEELS"; then
  if [[ "$TENANT_HTTP" == "200" ]]; then
    echo "FATAL: wheels fallback present even with auth"
    exit 5
  fi
  echo "WARN: wheels fallback present, but unauth context (expected)"
else
  echo "OK: wheels fallback absent"
fi

docker exec -w /app mytitan_api /bin/sh -lc "npm run test:scheduling"
docker exec -w /app mytitan_api /bin/sh -lc "npm run audit:top1"

cat > "$EXPL" <<MD
# Top1 finalize v2 report ($TS)
- branch: $(git branch --show-current)
- api: http://127.0.0.1:3000
- app: http://127.0.0.1:3001
- marketing: http://127.0.0.1:3002
## Gates
- API health: 200
- App dashboard: 200
- Dev admin: /admin/dev/me -> 401
- DB overlaps (planned): $OVERLAP
- Wheels gate: auth_http=$TENANT_HTTP (strict only when 200)
## Artifacts
- LOG: $LOG
- DBE: $DBE
- EXPLAIN: $EXPL
MD

echo "OK: finalize complete"
echo "LOG=$LOG"
echo "DBE=$DBE"

echo "==> DB overlap check (deterministic count)"
overlap_rows="$(psql_in_pg $'WITH b AS (
  SELECT
    id,
    "companyId" AS company_id,
    "assignedUserId" AS user_id,
    tsrange("startAt","endAt",\'[)\') AS r
  FROM "Booking"
  WHERE status = \'PLANNED\'
    AND "assignedUserId" IS NOT NULL
),
pairs AS (
  SELECT 1 AS overlap
  FROM b b1
  JOIN b b2
    ON b1.company_id = b2.company_id
   AND b1.user_id = b2.user_id
   AND b1.id < b2.id
   AND b1.r && b2.r
)
SELECT COUNT(*) FROM pairs;')"

if ! [[ "$overlap_rows" =~ ^[0-9]+$ ]]; then
  echo "FATAL: overlap_rows is not numeric: '$overlap_rows'"
  exit 80
fi

echo "OK: overlap_rows=$overlap_rows"
if [ "$overlap_rows" -ne 0 ]; then
  echo "FATAL: overlaps exist (overlap_rows=$overlap_rows)"
  exit 81
fi


echo "EXPLAIN=$EXPL"
