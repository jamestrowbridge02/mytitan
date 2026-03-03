#!/bin/sh
set -eu

echo "=== Repo ==="
git branch --show-current
git status --porcelain || true
echo

echo "=== Docker ==="
docker compose ps || true
echo

echo "=== API: existing audit:top1 ==="
docker exec -w /app mytitan_api /bin/sh -lc "npm run -s audit:top1 >/dev/null 2>&1 && npm run audit:top1 || true"
echo

echo "=== API: check Helmet / security headers presence ==="
git grep -nEI "helmet\(|@nestjs/helmet|use\(helmet|SecurityHeaders|content-security-policy|csp" -- api/src || true
echo

echo "=== API: request-id + structured logging presence ==="
git grep -nEI "x-request-id|requestId|pino|nestjs-pino|winston|logger\.child|correlation|cls-hooked|AsyncLocalStorage" -- api/src || true
echo

echo "=== API: rate limiting usage (Throttler) ==="
git grep -nEI "ThrottlerModule|@Throttle|throttler" -- api/src || true
echo

echo "=== API: tenant scoping hotspots (Prisma) ==="
# Heuristic: find common findMany/findFirst/findUnique calls that might miss companyId scoping.
# This doesn't prove a bug, but gives you a review list fast.
git grep -nE "\.findMany\(|\.findFirst\(|\.findUnique\(|\.updateMany\(|\.deleteMany\(" -- api/src \
  | grep -vE "companyId|tenantId|where:\s*\{[^}]*companyId|where:\s*\{[^}]*tenantId" \
  | head -n 200 || true
echo

echo "=== API: routes must return 401 when auth-guarded (sanity scan) ==="
# Look for controllers using JwtAuthGuard and throwing NotFound/404 patterns.
git grep -nEI "UseGuards\(JwtAuthGuard\)|@UseGuards\(JwtAuthGuard\)" -- api/src || true
git grep -nEI "throw new NotFoundException|HttpStatus\.NOT_FOUND|status\(\s*404" -- api/src || true
echo

echo "=== Builds (already required) ==="
docker compose build api
docker compose build app
docker compose build marketing
echo

echo "=== API scheduling smoke ==="
docker exec -w /app mytitan_api /bin/sh -lc "npm run test:scheduling"
echo

echo "=== Done ==="
