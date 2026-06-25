#!/usr/bin/env bash
set -euo pipefail

is_bus_unavailable() {
  case "$1" in
    *"Failed to connect to bus"*|*"System has not been booted with systemd"*|*"No such file or directory"*)
      return 0
      ;;
  esac
  return 1
}

if ! command -v systemctl >/dev/null 2>&1; then
  echo "STATUS:unknown"
  echo "DETAIL:systemctl is unavailable on this host, so MyTitan cannot inspect scheduler timers."
  exit 1
fi

ready=1
found=0
bus_unknown=0
status_lines=()
for cadence in daily weekly monthly quarterly annual; do
  unit="mytitan-summary-${cadence}.timer"
  enabled_output="$(systemctl is-enabled "${unit}" 2>&1 || true)"
  active_output="$(systemctl is-active "${unit}" 2>&1 || true)"

  if is_bus_unavailable "${enabled_output}" || is_bus_unavailable "${active_output}"; then
    bus_unknown=1
  fi

  enabled="$(printf '%s' "${enabled_output}" | tr '\n' ' ' | xargs 2>/dev/null || true)"
  active="$(printf '%s' "${active_output}" | tr '\n' ' ' | xargs 2>/dev/null || true)"
  enabled="${enabled:-unknown}"
  active="${active:-unknown}"

  if [[ "${enabled}" != "not-found" ]]; then
    found=1
  fi
  if [[ "${enabled}" != "enabled" || "${active}" != "active" ]]; then
    ready=0
  fi

  status_lines+=("${cadence}: enabled=${enabled} active=${active}")
done

printf '%s\n' "${status_lines[@]}"

if [[ "${bus_unknown}" == "1" ]]; then
  echo "STATUS:unknown"
  echo "DETAIL:systemctl is present but the current runtime cannot inspect timer state through the system bus."
  exit 1
fi

if [[ "${found}" == "0" ]]; then
  echo "STATUS:not_configured"
  echo "DETAIL:MyTitan summary timers are absent on this host."
  exit 1
fi

if [[ "${ready}" == "1" ]]; then
  echo "STATUS:ready"
  echo "DETAIL:All MyTitan summary timers are enabled and active on this host."
  exit 0
fi

echo "STATUS:not_configured"
echo "DETAIL:MyTitan summary timers exist but one or more cadences are not enabled and active yet."
exit 1
