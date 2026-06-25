#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
VALIDATOR="${BASE}/scripts/validate-e2e-stable.sh"
CLEANUP="${BASE}/scripts/cleanup-orphaned-playwright.sh"
LOCK_FILE="/tmp/mytitan-validation/guardrail-test.lock"

grep -q 'flock -n 9' "${VALIDATOR}"
grep -q 'PLAYWRIGHT_STABLE_WORKERS:-1' "${VALIDATOR}"
grep -q 'PLAYWRIGHT_TEST_TIMEOUT_MS:-45000' "${VALIDATOR}"
grep -q 'PLAYWRIGHT_SUITE_TIMEOUT_SECONDS:-7200' "${VALIDATOR}"
grep -q 'cleanup-orphaned-playwright.sh --apply' "${VALIDATOR}"
grep -q 'ppid.*"1"' "${CLEANUP}"
grep -q '/opt/mytitan/app/node_modules/playwright/' "${CLEANUP}"

mkdir -p "$(dirname "${LOCK_FILE}")"
(
  flock -n 8
  output="$(
    MYTITAN_E2E_LOCK_FILE="${LOCK_FILE}" \
      bash "${VALIDATOR}" 2>&1 || true
  )"
  grep -q "VALIDATION_ALREADY_RUNNING" <<<"${output}"
  grep -q "EXIT_CODE:209" <<<"${output}"
) 8>"${LOCK_FILE}"

bash "${BASE}/scripts/media-processing-status.sh" | grep -q "STATUS:ready"
echo "validation-guardrails: ok"
