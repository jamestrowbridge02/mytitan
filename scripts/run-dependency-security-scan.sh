#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${MYTITAN_EVIDENCE_DIR:-${REPO_ROOT}/evidence}/security"
JSON="${OUT_DIR}/latest.json"
MD="${OUT_DIR}/latest.md"

mkdir -p "${OUT_DIR}"

run_audit() {
  local name="$1"
  local dir="$2"
  local log="${OUT_DIR}/${name}-npm-audit.json"
  if [ ! -d "${REPO_ROOT}/${dir}" ]; then
    printf '{"package":"%s","status":"not_applicable","reason":"directory missing"}' "${name}"
    return 0
  fi
  (cd "${REPO_ROOT}/${dir}" && npm audit --json --audit-level=high) >"${log}" 2>&1
  local code=$?
  local status="pass"
  if [ "${code}" -ne 0 ]; then
    if grep -qi 'EAI_AGAIN\|audit endpoint returned an error\|getaddrinfo' "${log}"; then
      status="needs_evidence"
      code=0
    else
      status="fail_or_needs_review"
    fi
  fi
  printf '{"package":"%s","status":"%s","exitCode":%s,"log":"%s","gate":"high_or_critical_vulnerabilities"}' "${name}" "${status}" "${code}" "${log#${REPO_ROOT}/}"
  return "${code}"
}

api="$(run_audit api api)"; api_code=$?
app="$(run_audit app app)"; app_code=$?
marketing="$(run_audit marketing marketing)"; marketing_code=$?

overall="pass"
if [ "${api_code}" -ne 0 ] || [ "${app_code}" -ne 0 ] || [ "${marketing_code}" -ne 0 ]; then
  overall="fail_or_needs_review"
elif printf '%s\n%s\n%s\n' "${api}" "${app}" "${marketing}" | grep -q '"status":"needs_evidence"'; then
  overall="needs_evidence"
fi

cat >"${JSON}" <<EOF
{
  "generatedAt": "$(date -Is)",
  "overallStatus": "${overall}",
  "secretPolicy": "npm audit logs must not include .env, raw private keys, webhook secrets, or payment secrets.",
  "results": [
    ${api},
    ${app},
    ${marketing}
  ],
  "exceptions": []
}
EOF

cat >"${MD}" <<EOF
# Dependency And Security Scan

- Generated: $(date -Is)
- Overall status: ${overall}
- Gate: high or critical vulnerabilities require remediation or a dated exception with owner.
EOF

echo "SECURITY_EVIDENCE_JSON:${JSON}"
[ "${overall}" = "fail_or_needs_review" ] && exit 1
exit 0
