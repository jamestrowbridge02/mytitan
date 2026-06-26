#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${MYTITAN_EVIDENCE_DIR:-${REPO_ROOT}/evidence}/typecheck"
JSON="${OUT_DIR}/latest.json"
MD="${OUT_DIR}/latest.md"

mkdir -p "${OUT_DIR}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/	/\\t/g'
}

run_check() {
  local name="$1"
  local dir="$2"
  local command="$3"
  local log="${OUT_DIR}/${name}.log"

  if [ ! -d "${REPO_ROOT}/${dir}" ]; then
    printf '{"package":"%s","status":"not_applicable","command":"%s","log":"%s","reason":"directory missing"}' "${name}" "$(json_escape "${command}")" "$(json_escape "${log#${REPO_ROOT}/}")"
    return 0
  fi

  if [ ! -x "${REPO_ROOT}/${dir}/node_modules/.bin/tsc" ]; then
    printf 'TypeScript compiler is not installed locally for %s. Run npm install in %s or execute inside the release container.\n' "${name}" "${dir}" >"${log}"
    printf '{"package":"%s","status":"needs_evidence","exitCode":0,"command":"%s","log":"%s","reason":"local TypeScript compiler missing; network install is intentionally not attempted"}' "${name}" "$(json_escape "${command}")" "$(json_escape "${log#${REPO_ROOT}/}")"
    return 0
  fi

  (cd "${REPO_ROOT}/${dir}" && sh -lc "${command}") >"${log}" 2>&1
  local code=$?
  local status="pass"
  [ "${code}" -eq 0 ] || status="fail"
  printf '{"package":"%s","status":"%s","exitCode":%s,"command":"%s","log":"%s"}' "${name}" "${status}" "${code}" "$(json_escape "${command}")" "$(json_escape "${log#${REPO_ROOT}/}")"
  return "${code}"
}

api_result="$(run_check api api './node_modules/.bin/tsc --noEmit')"; api_code=$?
app_result="$(run_check app app './node_modules/.bin/tsc --noEmit -p tsconfig.release.json')"; app_code=$?
marketing_result="$(run_check marketing marketing './node_modules/.bin/tsc --noEmit')"; marketing_code=$?

overall="pass"
if [ "${api_code}" -ne 0 ] || [ "${app_code}" -ne 0 ] || [ "${marketing_code}" -ne 0 ]; then
  overall="fail"
elif printf '%s\n%s\n%s\n' "${api_result}" "${app_result}" "${marketing_result}" | grep -q '"status":"needs_evidence"'; then
  overall="needs_evidence"
fi

cat >"${JSON}" <<EOF
{
  "generatedAt": "$(date -Is)",
  "overallStatus": "${overall}",
  "scope": "Production package TypeScript checks. Legacy ad-hoc scripts are not silently deleted; exclusions and failures must be remediated in tracked notes.",
  "results": [
    ${api_result},
    ${app_result},
    ${marketing_result}
  ],
  "legacyScriptPolicy": {
    "status": "documented",
    "note": "JavaScript and ts-node utility scripts remain operationally useful and are checked by their owning smoke commands where available. They are not represented as strict production package TypeScript proof unless included by a package tsconfig."
  }
}
EOF

cat >"${MD}" <<EOF
# Typecheck Evidence

- Generated: $(date -Is)
- Overall status: ${overall}
- API: ${api_code}
- App: ${app_code}
- Marketing: ${marketing_code}

Logs are stored beside this file. A non-zero package exit keeps Engineering Excellence below 10/10.
EOF

echo "TYPECHECK_EVIDENCE_JSON:${JSON}"
echo "TYPECHECK_STATUS:${overall}"
[ "${overall}" = "fail" ] && exit 1
exit 0
