#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${MYTITAN_EVIDENCE_DIR:-${REPO_ROOT}/evidence}/bundle"
JSON="${OUT_DIR}/latest.json"
MD="${OUT_DIR}/latest.md"

mkdir -p "${OUT_DIR}"

APP_BUDGET_KB="${MYTITAN_APP_ROUTE_BUDGET_KB:-850}"
MARKETING_BUDGET_KB="${MYTITAN_MARKETING_ROUTE_BUDGET_KB:-450}"

measure_dir_kb() {
  local dir="$1"
  if [ -d "${dir}" ]; then
    du -sk "${dir}" | awk '{print $1}'
  else
    echo 0
  fi
}

app_static_kb="$(measure_dir_kb "${REPO_ROOT}/app/.next/static")"
marketing_static_kb="$(measure_dir_kb "${REPO_ROOT}/marketing/.next/static")"

app_status="needs_evidence"
marketing_status="needs_evidence"
[ "${app_static_kb}" -gt 0 ] && app_status="pass"
[ "${marketing_static_kb}" -gt 0 ] && marketing_status="pass"
[ "${app_static_kb}" -gt "${APP_BUDGET_KB}" ] && app_status="fail"
[ "${marketing_static_kb}" -gt "${MARKETING_BUDGET_KB}" ] && marketing_status="fail"

overall="pass"
if [ "${app_status}" = "fail" ] || [ "${marketing_status}" = "fail" ]; then
  overall="fail"
elif [ "${app_status}" = "needs_evidence" ] || [ "${marketing_status}" = "needs_evidence" ]; then
  overall="needs_evidence"
fi

cat >"${JSON}" <<EOF
{
  "generatedAt": "$(date -Is)",
  "overallStatus": "${overall}",
  "budgets": {
    "appRouteBudgetKb": ${APP_BUDGET_KB},
    "marketingRouteBudgetKb": ${MARKETING_BUDGET_KB}
  },
  "results": [
    {
      "package": "app",
      "status": "${app_status}",
      "measuredStaticKb": ${app_static_kb},
      "budgetKb": ${APP_BUDGET_KB},
      "source": "app/.next/static",
      "note": "Run npm run build in app before this check for concrete bundle evidence."
    },
    {
      "package": "marketing",
      "status": "${marketing_status}",
      "measuredStaticKb": ${marketing_static_kb},
      "budgetKb": ${MARKETING_BUDGET_KB},
      "source": "marketing/.next/static",
      "note": "Run npm run build in marketing before this check for concrete bundle evidence."
    }
  ],
  "optionalAnalyzer": {
    "status": "not_required",
    "note": "No optional bundle analyzer dependency is required for release gating; static artifact size is used when builds exist."
  }
}
EOF

cat >"${MD}" <<EOF
# Bundle Budget Evidence

- Generated: $(date -Is)
- Overall status: ${overall}
- App static KB: ${app_static_kb} / ${APP_BUDGET_KB}
- Marketing static KB: ${marketing_static_kb} / ${MARKETING_BUDGET_KB}

Missing build artifacts are reported as needs_evidence, not as a pass.
EOF

echo "BUNDLE_EVIDENCE_JSON:${JSON}"
echo "BUNDLE_STATUS:${overall}"
[ "${overall}" = "fail" ] && exit 1
exit 0
