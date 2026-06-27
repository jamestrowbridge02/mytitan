#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${MYTITAN_EVIDENCE_DIR:-${REPO_ROOT}/evidence}/bundle"
JSON="${OUT_DIR}/latest.json"
MD="${OUT_DIR}/latest.md"

mkdir -p "${OUT_DIR}"

APP_BUDGET_KB="${MYTITAN_APP_STATIC_BUDGET_KB:-7000}"
MARKETING_BUDGET_KB="${MYTITAN_MARKETING_STATIC_BUDGET_KB:-1200}"

measure_dir_kb() {
  local dir="$1"
  if [ -d "${dir}" ]; then
    du -sk "${dir}" | awk '{print $1}'
  else
    echo 0
  fi
}

measure_container_dir_kb() {
  local container="$1"
  local dir="$2"
  local measured
  command -v docker >/dev/null 2>&1 || { echo 0; return; }
  measured="$(docker exec "${container}" /bin/sh -lc "if [ -d '${dir}' ]; then du -sk '${dir}'; else echo 0; fi" 2>/dev/null || true)"
  echo "${measured}" | awk '{print $1}'
}

app_source="app/.next/static"
marketing_source="marketing/.next/static"
app_static_kb="$(measure_dir_kb "${REPO_ROOT}/app/.next/static")"
marketing_static_kb="$(measure_dir_kb "${REPO_ROOT}/marketing/.next/static")"

if [ "${app_static_kb}" -eq 0 ]; then
  app_static_kb="$(measure_dir_kb "${OUT_DIR}/artifacts/app-static")"
  [ "${app_static_kb}" -gt 0 ] && app_source="evidence/bundle/artifacts/app-static"
fi

if [ "${marketing_static_kb}" -eq 0 ]; then
  marketing_static_kb="$(measure_dir_kb "${OUT_DIR}/artifacts/marketing-static")"
  [ "${marketing_static_kb}" -gt 0 ] && marketing_source="evidence/bundle/artifacts/marketing-static"
fi

if [ "${app_static_kb}" -eq 0 ]; then
  app_static_kb="$(measure_container_dir_kb mytitan_app /app/.next/static)"
  [ "${app_static_kb}" -gt 0 ] && app_source="docker:mytitan_app:/app/.next/static"
fi

if [ "${marketing_static_kb}" -eq 0 ]; then
  marketing_static_kb="$(measure_container_dir_kb mytitan_marketing /app/.next/static)"
  [ "${marketing_static_kb}" -gt 0 ] && marketing_source="docker:mytitan_marketing:/app/.next/static"
fi

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
    "appStaticBudgetKb": ${APP_BUDGET_KB},
    "marketingStaticBudgetKb": ${MARKETING_BUDGET_KB}
  },
  "results": [
    {
      "package": "app",
      "status": "${app_status}",
      "measuredStaticKb": ${app_static_kb},
      "budgetKb": ${APP_BUDGET_KB},
      "source": "${app_source}",
      "note": "Measured local app build artifacts when available, copied release evidence artifacts next, otherwise the running mytitan_app container from the release Docker build."
    },
    {
      "package": "marketing",
      "status": "${marketing_status}",
      "measuredStaticKb": ${marketing_static_kb},
      "budgetKb": ${MARKETING_BUDGET_KB},
      "source": "${marketing_source}",
      "note": "Measured local marketing build artifacts when available, copied release evidence artifacts next, otherwise the running mytitan_marketing container from the release Docker build."
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
- App static KB: ${app_static_kb} / ${APP_BUDGET_KB} (${app_source})
- Marketing static KB: ${marketing_static_kb} / ${MARKETING_BUDGET_KB} (${marketing_source})

Missing build artifacts are reported as needs_evidence, not as a pass.
EOF

echo "BUNDLE_EVIDENCE_JSON:${JSON}"
echo "BUNDLE_STATUS:${overall}"
[ "${overall}" = "fail" ] && exit 1
[ "${overall}" = "needs_evidence" ] && exit 1
exit 0
