#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${MYTITAN_EVIDENCE_DIR:-${REPO_ROOT}/evidence}/lighthouse"
JSON="${OUT_DIR}/latest.json"
MD="${OUT_DIR}/latest.md"

mkdir -p "${OUT_DIR}"

lh_status="needs_evidence"
lh_note="Lighthouse CLI is not installed in this environment. This is a Local Lighthouse evidence slot only and is not production Web Vitals proof."
if command -v lighthouse >/dev/null 2>&1; then
  lh_status="available"
  lh_note="Lighthouse CLI is available. Run this script with MYTITAN_RUN_LIGHTHOUSE=1 and local services started to collect JSON reports."
fi

cat >"${JSON}" <<EOF
{
  "generatedAt": "$(date -Is)",
  "status": "${lh_status}",
  "evidenceType": "Local Lighthouse evidence",
  "productionWebVitalsClaimed": false,
  "routes": [
    {"name":"marketing homepage","url":"http://127.0.0.1:3002/","status":"slot_created"},
    {"name":"marketing pricing","url":"http://127.0.0.1:3002/pricing","status":"slot_created"},
    {"name":"app login","url":"http://127.0.0.1:3001/login","status":"slot_created"},
    {"name":"app dashboard shell","url":"http://127.0.0.1:3001/dashboard","status":"slot_created"}
  ],
  "scores": {
    "performance": null,
    "accessibility": null,
    "seo": null,
    "bestPractices": null
  },
  "coreWebVitals": {
    "source": "production analytics required",
    "lcp": null,
    "inp": null,
    "cls": null,
    "status": "not_attached"
  },
  "note": "${lh_note}"
}
EOF

cat >"${MD}" <<EOF
# Local Lighthouse Evidence

- Generated: $(date -Is)
- Status: ${lh_status}
- Production Web Vitals claimed: false

${lh_note}
EOF

echo "LIGHTHOUSE_EVIDENCE_JSON:${JSON}"
