#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
UPLOAD_POLICY="${BASE}/api/src/common/upload-policy.ts"
PLAYWRIGHT_CONFIG="${BASE}/app/playwright.config.ts"
VALIDATOR="${BASE}/scripts/validate-e2e-stable.sh"

if ! grep -q "video: 100 \\* 1024 \\* 1024" "${UPLOAD_POLICY}"; then
  echo "STATUS:attention_needed"
  echo "DETAIL:Video upload size guard is missing."
  exit 1
fi

if ! grep -q 'video: stableMode ? "off"' "${PLAYWRIGHT_CONFIG}"; then
  echo "STATUS:attention_needed"
  echo "DETAIL:Stable validation may start Playwright ffmpeg recording."
  exit 1
fi

if ! grep -q 'PLAYWRIGHT_STABLE_WORKERS:-1' "${VALIDATOR}" ||
  ! grep -q 'PLAYWRIGHT_SUITE_TIMEOUT_SECONDS:-7200' "${VALIDATOR}"; then
  echo "STATUS:attention_needed"
  echo "DETAIL:Validation media processes are missing conservative concurrency or timeout guards."
  exit 1
fi

echo "STATUS:ready"
echo "DETAIL:Production uploads are size-bounded and do not invoke an ffmpeg transcoder; stable validation uses one worker, disables video recording, and has a two-hour process ceiling."
