#!/usr/bin/env bash
set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-7}"
MODE="dry-run"
BASE="/opt/mytitan"

if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
  shift
fi
if [[ "${1:-}" == "--days" ]]; then
  RETENTION_DAYS="${2:-7}"
  shift 2
fi

targets=(
  "/tmp/pw-results"
  "/tmp/mytitan-validation"
  "/tmp/mytitan-playwright"
  "${BASE}/app/test-results"
  "${BASE}/app/playwright-report"
)

echo "MODE:${MODE}"
echo "RETENTION_DAYS:${RETENTION_DAYS}"

cleanup_dir() {
  local dir="$1"
  [[ -d "${dir}" ]] || return 0
  echo "TARGET:${dir}"
  if [[ "${MODE}" == "dry-run" ]]; then
    find "${dir}" -mindepth 1 -mtime +"${RETENTION_DAYS}" -print
    return 0
  fi
  find "${dir}" -mindepth 1 -mtime +"${RETENTION_DAYS}" -print -exec rm -rf {} +
}

for target in "${targets[@]}"; do
  cleanup_dir "${target}"
done
