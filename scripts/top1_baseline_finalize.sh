#!/usr/bin/env bash
set -euo pipefail

cd /opt/mytitan

EMAIL="support@mytitan.co.uk"
PASSWORD="${MYTITAN_ADMIN_PASSWORD:-}"
if [[ -z "${PASSWORD}" ]]; then
  echo "FATAL: Set MYTITAN_ADMIN_PASSWORD first."
  echo "Example: export MYTITAN_ADMIN_PASSWORD='YourStrongPasswordHere'"
  exit 2
fi

BRANCH="feat/top1-multi-tenant-baseline-v1"
COOKIE_JAR="/tmp/mytitan_cookie_jar.txt"
TMP_DIR="/opt/mytitan/tmp"
TS="$(date -u +%Y%m%d_%H%M%S)"

mkdir -p scripts api/scripts "$TMP_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "FATAL: working tree not clean. Commit/stash first."
  git status --porcelain
  exit 2
fi

git checkout -B "$BRANCH"

cat > api/scripts/seed-top1-baseline.mjs <<'MJS'
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function env(name, fallback = "") {
  return (process.env[name] || fallback).toString();
}

async function ensureCompany(name, timezone = "Europe/London", currency = "GBP") {
  const db = prisma;
  if (db.company?.findFirst) {
    const existing = await db.company.findFirst({ where: { name } });
    if (existing) return existing;
    return await db.company.create({ data: { name, timezone, currency } });
  }
  if (db.tenant?.findFirst) {
    const existing = await db.tenant.findFirst({ where: { name } });
    if (existing) return existing;
    return await db.tenant.create({ data: { name, timezone, currency } });
  }
  throw new Error("Neither prisma.company nor prisma.tenant exists. Check schema.");
}

async function ensureTenantSetting(tenantId) {
  const db = prisma;
  if (!db.tenantSetting?.upsert) throw new Error("prisma.tenantSetting missing");
  return await db.tenantSetting.upsert({
    where: { tenantId },
    update: { primaryTrade: "WHEELS" },
    create: { tenantId, primaryTrade: "WHEELS" },
  });
}

async function ensureOwnerUser(email, companyId, password) {
  const db = prisma;
  if (!db.user?.findFirst) throw new Error("prisma.user missing");

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.user.findFirst({ where: { email } });

  if (existing) {
    const data = { companyId, role: "OWNER" };
    try {
      await db.user.update({ where: { id: existing.id }, data: { ...data, passwordHash } });
    } catch {
      await db.user.update({ where: { id: existing.id }, data: { ...data, password: passwordHash } });
    }
    return await db.user.findUnique({ where: { id: existing.id } });
  }

  try {
    return await db.user.create({
      data: { email, companyId, role: "OWNER", passwordHash, name: "MyTitan Owner" },
    });
  } catch {
    return await db.user.create({
      data: { email, companyId, role: "OWNER", password: passwordHash, name: "MyTitan Owner" },
    });
  }
}

async function main() {
  const password = env("TOP1_OWNER_PASSWORD");
  if (!password) throw new Error("TOP1_OWNER_PASSWORD env required for seed script");

  const mytitan = await ensureCompany("MyTitan", "Europe/London", "GBP");
  const acme = await ensureCompany("Acme Tenant", "Europe/London", "GBP");

  await ensureTenantSetting(mytitan.id);
  await ensureTenantSetting(acme.id);

  await ensureOwnerUser(env("TOP1_OWNER_EMAIL", "support@mytitan.co.uk"), mytitan.id, password);

  console.log("==> Seed complete");
  console.log(`MyTitan tenantId: ${mytitan.id}`);
  console.log(`Acme Tenant tenantId: ${acme.id}`);
}

main()
  .catch((e) => {
    console.error("SEED_FATAL:", e?.stack || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
MJS

cat > scripts/top1_finalize_v2.sh <<'SH2'
#!/usr/bin/env bash
set -euo pipefail
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
echo "EXPLAIN=$EXPL"
SH2
chmod +x scripts/top1_finalize_v2.sh

git add api/scripts/seed-top1-baseline.mjs scripts/top1_finalize_v2.sh
git commit -m "chore(top1): add multi-tenant baseline seed + finalize v2 runner" || true

echo "==> Seeding baseline via API container"
docker exec -w /app -e "TOP1_OWNER_EMAIL=$EMAIL" -e "TOP1_OWNER_PASSWORD=$PASSWORD" mytitan_api /bin/sh -lc \
  "node /app/scripts/seed-top1-baseline.mjs | tee /tmp/top1_seed_${TS}.log"

echo
echo "==> Tenant IDs (copy/paste)"
docker exec mytitan_postgres /bin/sh -lc \
  "psql -U mytitan -d mytitan -c \"SELECT \\\"tenantId\\\" AS \\\"tenantId\\\", c.name AS name, \\\"primaryTrade\\\" FROM \\\"TenantSetting\\\" ts JOIN \\\"Company\\\" c ON c.id = ts.\\\"tenantId\\\" ORDER BY c.createdAt ASC;\"" \
  || true

echo
echo "==> Login -> COOKIE_JAR"
rm -f "$COOKIE_JAR"
LOGIN_CODE="$(curl -sS -o "$TMP_DIR/top1_login_${TS}.json" -w "%{http_code}" \
  -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  http://127.0.0.1:3000/auth/login || true)"
echo "login_http=$LOGIN_CODE"
sed -n '1,4p' "$TMP_DIR/top1_login_${TS}.json" || true

if [[ ! -s "$COOKIE_JAR" ]]; then
  echo "WARN: COOKIE_JAR empty. If login returns JWT, run finalize with:"
  echo "  AUTH_BEARER='<jwt>' COOKIE_JAR='' bash scripts/top1_finalize_v2.sh"
fi

COOKIE_JAR="$COOKIE_JAR" bash scripts/top1_finalize_v2.sh
