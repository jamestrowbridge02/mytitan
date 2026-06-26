#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${MYTITAN_EVIDENCE_DIR:-${REPO_ROOT}/evidence}/accessibility"
JSON="${OUT_DIR}/latest.json"
MD="${OUT_DIR}/latest.md"

mkdir -p "${OUT_DIR}"

cat >"${JSON}" <<EOF
{
  "generatedAt": "$(date -Is)",
  "overallStatus": "needs_evidence",
  "automation": [
    {"area":"keyboard navigation","status":"covered_by_e2e_slots","coverage":"shell-polish, mobile-shell, ui-hardening"},
    {"area":"focus order","status":"covered_by_e2e_slots","coverage":"shell-polish, phase-18 mobile checks"},
    {"area":"ARIA landmarks and labels","status":"needs_dedicated_audit","coverage":"route checklist slot created"},
    {"area":"contrast","status":"needs_dedicated_audit","coverage":"visual polish and theme coverage slots"},
    {"area":"touch target and no overflow","status":"covered_by_e2e_slots","coverage":"mobile-shell, tablet-layouts, phase-18 certification"},
    {"area":"forms and errors","status":"covered_by_e2e_slots","coverage":"setup wizard, booking, dashboard workflows"},
    {"area":"modals and drawers","status":"covered_by_e2e_slots","coverage":"ui-hardening and shell polish"},
    {"area":"public booking, tenant app, platform admin, marketing","status":"covered_by_route_slots","coverage":"stable Playwright suite"}
  ],
  "dependencyPolicy": "No new axe dependency was added in Phase 19. This file records current automation and the remediation path for a dedicated axe/contrast pass."
}
EOF

cat >"${MD}" <<EOF
# Accessibility Evidence

- Generated: $(date -Is)
- Overall status: needs_evidence
- Current proof: stable Playwright coverage for keyboard/no-overflow/forms and route availability.
- Missing proof: dedicated axe/contrast report artifact.
EOF

echo "ACCESSIBILITY_EVIDENCE_JSON:${JSON}"
