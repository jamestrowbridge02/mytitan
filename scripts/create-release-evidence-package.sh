#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TAG_OR_DATE="${1:-$(git -C "${REPO_ROOT}" describe --tags --exact-match 2>/dev/null || date +%Y%m%d-%H%M%S)}"
OUT_ROOT="${REPO_ROOT}/release-evidence/${TAG_OR_DATE}"
LOG_DIR="${OUT_ROOT}/logs"
EVIDENCE_DIR="${OUT_ROOT}/evidence"

mkdir -p "${LOG_DIR}" "${EVIDENCE_DIR}"

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -e "${src}" ]; then
    mkdir -p "$(dirname "${dest}")"
    cp -R "${src}" "${dest}"
  fi
}

run_capture() {
  local name="$1"
  shift
  "$@" >"${LOG_DIR}/${name}.log" 2>&1
  local code=$?
  echo "${code}" >"${LOG_DIR}/${name}.exit"
  return 0
}

write_slot() {
  local name="$1"
  local status="$2"
  local reason="$3"
  {
    echo "STATUS:${status}"
    echo "REASON:${reason}"
  } >"${LOG_DIR}/${name}.log"
  echo "0" >"${LOG_DIR}/${name}.exit"
}

run_api_container_capture() {
  local name="$1"
  local command="$2"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'mytitan_api'; then
    run_capture "${name}" docker exec -w /app mytitan_api /bin/sh -lc "${command}"
  else
    write_slot "${name}" "needs_evidence" "mytitan_api container is not running or Docker is unavailable in this environment."
  fi
}

git -C "${REPO_ROOT}" rev-parse HEAD >"${OUT_ROOT}/git-head.txt"
git -C "${REPO_ROOT}" status --short >"${OUT_ROOT}/git-status-short.txt"
git -C "${REPO_ROOT}" tag --points-at HEAD >"${OUT_ROOT}/git-tags.txt"

write_slot stable-suite "needs_evidence" "Attach the latest bash ./scripts/validate-e2e-stable.sh output from the release gate. Set MYTITAN_RELEASE_EVIDENCE_RUN_STABLE=1 to capture it inside this package."
if [ "${MYTITAN_RELEASE_EVIDENCE_RUN_STABLE:-0}" = "1" ]; then
  run_capture stable-suite bash "${REPO_ROOT}/scripts/validate-e2e-stable.sh"
fi

run_capture typecheck bash "${REPO_ROOT}/scripts/run-release-typechecks.sh"
run_capture bundle bash "${REPO_ROOT}/scripts/check-bundle-budgets.sh"
run_capture screenshots bash "${REPO_ROOT}/scripts/collect-screenshot-baseline.sh"
run_capture lighthouse bash "${REPO_ROOT}/scripts/generate-local-lighthouse-evidence.sh"
run_capture accessibility bash "${REPO_ROOT}/scripts/run-accessibility-evidence.sh"
run_capture api-contract bash "${REPO_ROOT}/scripts/collect-api-contract-evidence.sh"
run_capture architecture bash "${REPO_ROOT}/scripts/generate-architecture-docs.sh"
run_capture security bash "${REPO_ROOT}/scripts/run-dependency-security-scan.sh"

run_capture healthcheck bash "${REPO_ROOT}/scripts/healthcheck.sh"
run_capture production-readiness bash "${REPO_ROOT}/scripts/production-readiness-check.sh"
run_api_container_capture migration-status "npx prisma migrate status"
run_api_container_capture notification-verification "npm run notifications:verify-routing"
run_api_container_capture billing-verification "npm run billing:verify-subscription-prices"
run_api_container_capture job-pack-sync-verification "npm run billing:sync-job-products"

copy_if_exists "${REPO_ROOT}/evidence" "${EVIDENCE_DIR}/repo-evidence"
copy_if_exists "${REPO_ROOT}/docs/architecture/generated" "${EVIDENCE_DIR}/architecture-generated"
copy_if_exists "${REPO_ROOT}/docs/audit/phase-18-evidence-based-certification-gate.md" "${EVIDENCE_DIR}/scorecard-phase18.md"
copy_if_exists "${REPO_ROOT}/docs/audit/phase-19-engineering-and-product-excellence.md" "${EVIDENCE_DIR}/scorecard-phase19.md"

cat >"${OUT_ROOT}/scorecard-summary.json" <<EOF
{
  "engineeringExcellence": {
    "status": "proven_with_remaining_evidence",
    "tenOutOfTenBlocked": true,
    "reason": "Engineering automation exists, but retained CI artifacts, deployment evidence, generated screenshot baselines, and security review evidence are still required before 10/10."
  },
  "productExcellence": {
    "status": "not_proven",
    "tenOutOfTenBlocked": true,
    "reason": "Product Excellence requires real-world operational evidence, production Web Vitals, external uptime history, pilots, adoption, retention, support, satisfaction, and tenant-owned payment canaries."
  }
}
EOF

cat >"${OUT_ROOT}/known-risks.md" <<EOF
# Known Risks

- Product Excellence cannot reach 10/10 until real-world usage, uptime history, production Web Vitals, support volume, satisfaction, pilots, and live payment canary evidence are attached.
- Local Lighthouse evidence is not production Web Vitals.
- Internal health snapshots are not external uptime history.
- Provider readiness is not claimed without tenant-owned credentials and audited canary evidence.
EOF

cat >"${OUT_ROOT}/rollback-notes.md" <<EOF
# Rollback Notes

Use the deployment runbook and restore checklist. Do not mutate Stripe products/prices during rollback. Preserve tenant isolation, RBAC, support-mode audit, and billing boundaries.
EOF

cat >"${OUT_ROOT}/manifest.json" <<EOF
{
  "generatedAt": "$(date -Is)",
  "tagOrDate": "${TAG_OR_DATE}",
  "gitHead": "$(git -C "${REPO_ROOT}" rev-parse HEAD)",
  "secretExclusionPolicy": [
    ".env",
    ".env.local",
    "node_modules",
    ".next",
    "raw private keys",
    "webhook secrets",
    "payment secrets"
  ],
  "artifacts": {
    "gitHead": "git-head.txt",
    "gitStatus": "git-status-short.txt",
    "logs": "logs/",
    "evidence": "evidence/",
    "scorecardSummary": "scorecard-summary.json",
    "knownRisks": "known-risks.md",
    "rollbackNotes": "rollback-notes.md"
  }
}
EOF

if command -v tar >/dev/null 2>&1; then
  tar --exclude='.env' --exclude='.env.local' --exclude='node_modules' --exclude='.next' -czf "${OUT_ROOT}.tar.gz" -C "${REPO_ROOT}/release-evidence" "${TAG_OR_DATE}" >/dev/null 2>&1 || true
fi

if rg -n 'sk_(live|test)_[A-Za-z0-9]{8,}|pk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY' "${OUT_ROOT}" >/dev/null 2>&1; then
  echo "SECRET_SCAN_STATUS:fail"
  exit 1
fi

echo "RELEASE_EVIDENCE_PACKAGE:${OUT_ROOT}"
echo "SECRET_SCAN_STATUS:pass"
