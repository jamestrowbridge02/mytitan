#!/usr/bin/env bash
set -euo pipefail

MODE="dry-run"
MIN_AGE_SECONDS="${PLAYWRIGHT_ORPHAN_MIN_AGE_SECONDS:-600}"

if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
  shift
fi
if [[ "${1:-}" == "--min-age" ]]; then
  MIN_AGE_SECONDS="${2:-600}"
fi

is_mytitan_test_process() {
  local command="$1"
  [[ "${command}" == *"/opt/mytitan/app/node_modules/playwright/"* ]] ||
    [[ "${command}" == *"/opt/mytitan/app/node_modules/.bin/playwright"* ]] ||
    [[ "${command}" == *"/root/.cache/ms-playwright/"*"chrome-headless-shell"* ]] ||
    [[ "${command}" == *"/root/.cache/ms-playwright/"*"ffmpeg-linux"*"/tmp/pw-results/"* ]]
}

declare -a matches=()
while read -r pid ppid elapsed command; do
  [[ "${pid}" =~ ^[0-9]+$ ]] || continue
  [[ "${ppid}" == "1" ]] || continue
  (( elapsed >= MIN_AGE_SECONDS )) || continue
  if is_mytitan_test_process "${command}"; then
    matches+=("${pid}")
    echo "ORPHAN pid=${pid} age_seconds=${elapsed} command=${command}"
  fi
done < <(ps -eo pid=,ppid=,etimes=,args=)

echo "MODE:${MODE}"
echo "MIN_AGE_SECONDS:${MIN_AGE_SECONDS}"
echo "MATCHED:${#matches[@]}"

if [[ "${MODE}" != "apply" || "${#matches[@]}" -eq 0 ]]; then
  exit 0
fi

kill -TERM "${matches[@]}" 2>/dev/null || true
sleep 5

declare -a survivors=()
for pid in "${matches[@]}"; do
  if kill -0 "${pid}" 2>/dev/null; then
    survivors+=("${pid}")
  fi
done
if [[ "${#survivors[@]}" -gt 0 ]]; then
  kill -KILL "${survivors[@]}" 2>/dev/null || true
fi

echo "TERMINATED:${#matches[@]}"
