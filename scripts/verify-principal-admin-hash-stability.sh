#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

read_admin_fingerprint() {
  docker exec -w /app mytitan_api /bin/sh -lc 'node -e "const crypto=require(\"crypto\");const {PrismaClient}=require(\"@prisma/client\");const db=new PrismaClient();const fp=(value)=>crypto.createHash(\"sha256\").update(\"mytitan-auth-fingerprint-v1:\"+String(value||\"\")).digest(\"hex\").slice(0,16);(async()=>{const admin=await db.user.findFirst({where:{email:\"admin@mytitan.co.uk\"},select:{passwordHash:true,isActive:true,emailVerified:true,role:true}});if(!admin?.passwordHash) throw new Error(\"principal admin hash missing\");if(admin.isActive===false) throw new Error(\"principal admin inactive\");if(!admin.emailVerified) throw new Error(\"principal admin email unverified\");if(admin.role!==\"OWNER\") throw new Error(\"principal admin role invalid\");process.stdout.write(fp(admin.passwordHash));await db.\$disconnect();})().catch(async e=>{console.error(e.message);await db.\$disconnect();process.exit(1);});"'
}

assert_fingerprint_unchanged() {
  local label="$1"
  local expected="$2"
  local observed
  observed="$(read_admin_fingerprint)"
  if [[ "$observed" != "$expected" ]]; then
    echo "PRINCIPAL_ADMIN_HASH_STABILITY:fail step=$label"
    exit 1
  fi
  echo "PRINCIPAL_ADMIN_HASH_STABILITY:pass step=$label"
}

baseline="$(read_admin_fingerprint)"
echo "PRINCIPAL_ADMIN_HASH_STABILITY:baseline captured"

docker exec -w /app mytitan_api /bin/sh -lc 'npm run seed:e2e' >/dev/null
assert_fingerprint_unchanged "seed_e2e" "$baseline"

docker exec -w /app mytitan_api /bin/sh -lc 'npm run auth:verify-principal-admin-immutability' >/dev/null
assert_fingerprint_unchanged "principal_admin_immutability_verifier" "$baseline"

docker exec -w /app mytitan_api /bin/sh -lc 'npm run platform:verify-protected-records' >/dev/null
assert_fingerprint_unchanged "protected_records_verifier" "$baseline"

docker compose -p mytitan up -d --force-recreate api app >/dev/null
assert_fingerprint_unchanged "docker_recreate" "$baseline"

bash ./scripts/production-readiness-check.sh >/dev/null
assert_fingerprint_unchanged "production_readiness" "$baseline"

bash ./scripts/create-release-evidence-package.sh >/dev/null
assert_fingerprint_unchanged "release_evidence" "$baseline"

echo "PRINCIPAL_ADMIN_HASH_STABILITY:ok"
