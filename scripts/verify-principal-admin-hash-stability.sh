#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

read_admin_hash() {
  docker exec -w /app mytitan_api /bin/sh -lc 'node -e "const {PrismaClient}=require(\"@prisma/client\");const db=new PrismaClient();(async()=>{const admin=await db.user.findFirst({where:{email:\"admin@mytitan.co.uk\"},select:{passwordHash:true,isActive:true,emailVerified:true,role:true}});if(!admin?.passwordHash) throw new Error(\"principal admin hash missing\");if(admin.isActive===false) throw new Error(\"principal admin inactive\");if(!admin.emailVerified) throw new Error(\"principal admin email unverified\");if(admin.role!==\"OWNER\") throw new Error(\"principal admin role invalid\");process.stdout.write(admin.passwordHash);await db.\$disconnect();})().catch(async e=>{console.error(e.message);await db.\$disconnect();process.exit(1);});"'
}

assert_hash_unchanged() {
  local label="$1"
  local expected="$2"
  local observed
  observed="$(read_admin_hash)"
  if [[ "$observed" != "$expected" ]]; then
    echo "PRINCIPAL_ADMIN_HASH_STABILITY:fail step=$label"
    exit 1
  fi
  echo "PRINCIPAL_ADMIN_HASH_STABILITY:pass step=$label"
}

baseline="$(read_admin_hash)"
echo "PRINCIPAL_ADMIN_HASH_STABILITY:baseline captured"

docker exec -w /app mytitan_api /bin/sh -lc 'npm run seed:e2e' >/dev/null
assert_hash_unchanged "seed_e2e" "$baseline"

docker exec -w /app mytitan_api /bin/sh -lc 'node -e "const {PrismaClient}=require(\"@prisma/client\");const db=new PrismaClient();(async()=>{await db.platformEmailProviderConfig.deleteMany({where:{id:\"system_email\"}}).catch(()=>undefined);await db.platformExternalMonitorConfig.deleteMany({where:{id:\"external_monitor\"}}).catch(()=>undefined);await db.\$disconnect();})().catch(async e=>{console.error(e.message);await db.\$disconnect();process.exit(1);});"' >/dev/null
assert_hash_unchanged "infrastructure_config_cleanup" "$baseline"

docker compose -p mytitan up -d --force-recreate api app >/dev/null
assert_hash_unchanged "docker_recreate" "$baseline"

bash ./scripts/production-readiness-check.sh >/dev/null
assert_hash_unchanged "production_readiness" "$baseline"

bash ./scripts/create-release-evidence-package.sh >/dev/null
assert_hash_unchanged "release_evidence" "$baseline"

echo "PRINCIPAL_ADMIN_HASH_STABILITY:ok"
