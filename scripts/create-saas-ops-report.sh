#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TAG_OR_DATE="${1:-$(git -C "${REPO_ROOT}" describe --tags --exact-match 2>/dev/null || date +%Y%m%d-%H%M%S)}"
OUT_ROOT="${REPO_ROOT}/release-evidence/${TAG_OR_DATE}/saas-ops"
REPORT="${OUT_ROOT}/company-operating-report.md"

mkdir -p "${OUT_ROOT}"

git_head="$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || printf 'unknown')"
git_tag="$(git -C "${REPO_ROOT}" describe --tags --exact-match 2>/dev/null || printf 'not_tagged')"
git_status="$(git -C "${REPO_ROOT}" status --short 2>/dev/null || true)"
if [ -z "${git_status}" ]; then
  tree_state="clean"
else
  tree_state="dirty"
fi

status_from_script() {
  local script="$1"
  if [ -x "${REPO_ROOT}/scripts/${script}" ] || [ -f "${REPO_ROOT}/scripts/${script}" ]; then
    bash "${REPO_ROOT}/scripts/${script}" >"${OUT_ROOT}/${script}.log" 2>&1
    printf '%s' "$?" >"${OUT_ROOT}/${script}.exit"
  else
    printf 'STATUS:not_configured\nREASON:%s missing\n' "${script}" >"${OUT_ROOT}/${script}.log"
    printf '0' >"${OUT_ROOT}/${script}.exit"
  fi
}

write_status_file() {
  local name="$1"
  local status="$2"
  local detail="$3"
  {
    printf 'status=%s\n' "${status}"
    printf 'detail=%s\n' "${detail}"
  } >"${OUT_ROOT}/${name}.status"
}

status_from_script "healthcheck.sh"
status_from_script "production-readiness-check.sh"
status_from_script "backup-readiness-status.sh"
status_from_script "summary-scheduler-status.sh"
status_from_script "external-monitoring-status.sh"

write_status_file "engineering" "actual" "Stable suite, typecheck/build, API contract, dependency audit, and release package evidence are tracked as release-gate evidence slots."
write_status_file "operations" "evidence_led" "Health, backup, scheduler, external monitor, and production readiness logs are captured without secrets."
write_status_file "customer-success" "not_enough_data" "Onboarding and support evidence slots exist; NPS and CSAT remain not_enough_data until real survey data exists."
write_status_file "commercial" "actuals_only" "MyTitan revenue is actual-only. Tenant deposits and invoices are excluded from MyTitan revenue."
write_status_file "product-quality" "evidence_led" "Workflow, portal, invoice/payment, mobile, visual, accessibility, and performance evidence are tracked as separate slots."
write_status_file "enterprise-readiness" "roadmap_guarded" "SSO, SCIM, data residency, certifications, and legal approvals are not marked live without evidence."
write_status_file "release-governance" "pending_final_validation" "Go/no-go remains pending until final validation completes and sign-off fields are filled."

find "${OUT_ROOT}" -type f -name '*.log' -print0 | while IFS= read -r -d '' file; do
  sed -i \
    -e 's/STRIPE_SECRET_KEY/REDACTED_SECRET_NAME/g' \
    -e 's/STRIPE_WEBHOOK_SECRET/REDACTED_SECRET_NAME/g' \
    -e 's/STRIPE_CONNECT_PLATFORM_SECRET/REDACTED_SECRET_NAME/g' \
    -e 's/STRIPE_CONNECT_WEBHOOK_SECRET/REDACTED_SECRET_NAME/g' \
    -e 's/platformSecretEncrypted/REDACTED_SECRET_FIELD/g' \
    -e 's/webhookSecretEncrypted/REDACTED_SECRET_FIELD/g' \
    -e 's/smtpPasswordEncrypted/REDACTED_SECRET_FIELD/g' \
    "${file}"
done

cat >"${REPORT}" <<EOF
# MyTitan SaaS Operating System Report

Generated: $(date -Is)
Repository: ${REPO_ROOT}
Commit: ${git_head}
Tag: ${git_tag}
Working tree: ${tree_state}

## Company Operating Report

This report is evidence-led. It does not claim customers, revenue, uptime, reviews, case studies, security certification, AI, provider readiness, or product-market fit without real evidence.

## Engineering Status

- Status: actual / evidence slots
- Build status: captured by Docker build validation.
- Test suite status: attach \`bash ./scripts/validate-e2e-stable.sh\` output.
- Typecheck evidence: captured through release build/typecheck commands.
- Dependency audit status: evidence slot only until current audit output is attached.
- API contract evidence: \`scripts/collect-api-contract-evidence.sh\`.
- Release evidence package: \`scripts/create-release-evidence-package.sh\`.
- Migration status: final validation runs \`npx prisma migrate deploy\`.

## Operations Status

- API/app/marketing health: see \`healthcheck.sh.log\` and Platform Autopilot.
- Database/Redis health: Platform Autopilot/internal monitoring.
- Backup freshness: see \`backup-readiness-status.sh.log\`.
- Restore drill: evidence slot, not inferred from backup presence.
- Scheduler status: see \`summary-scheduler-status.sh.log\`.
- External uptime: see \`external-monitoring-status.sh.log\`; remains not_configured unless real monitor details exist.

## Customer Success Status

- Onboarding pipeline: platform data only.
- First booking/job/invoice/payment: actual persisted tenant events only.
- Support requests/playbooks: platform-only evidence.
- Wheel A&R pilot: evidence slot only.
- NPS: not_enough_data.
- CSAT: not_enough_data.

## Commercial Status

- Actual MRR: actual MyTitan subscription/job-pack revenue only.
- Actual ARR: annualized from actual MyTitan MRR only.
- Paid customers: active MyTitan subscriptions only.
- Tenant deposits and tenant invoices are excluded from MyTitan revenue.
- Pipeline, SEO, sales notes, and pricing experiments remain evidence slots unless real evidence exists.

## Product Quality Status

- Workflow, onboarding, mobile, public booking, trade portal, customer portal, invoice/payment, visual, accessibility, performance, and user feedback are separate evidence slots.
- Missing evidence is reported as not_configured or not_enough_data.

## Enterprise Readiness Status

- SSO: roadmap.
- SCIM: roadmap.
- Data residency: roadmap.
- Security certification: not_configured.
- Legal/compliance evidence: not_configured.
- API/webhook readiness and rate-limit evidence are test-backed where present.

## Release Governance Status

- Current tag: ${git_tag}
- Commit hash: ${git_head}
- Validation evidence: attach stable suite output.
- Migration evidence: final validation command.
- Backup evidence: \`backup-readiness-status.sh.log\`.
- Stripe/payment canary: \`scripts/stripe-deposit-refund-canary.sh\`, safe execution only.
- Go/no-go: pending sign-off.

## Incident Management

Incidents are platform-only Company OS records. They include severity, affected service/tenant, owner, timeline, status, customer impact, resolution, postmortem link, and prevention action.

## Evidence Library

- Test results: \`/tmp/pw-results/final-proof.json\`
- Health checks: \`healthcheck.sh.log\`
- Readiness reports: \`production-readiness-check.sh.log\`
- Release packages: \`release-evidence/\`
- Screenshots: \`scripts/collect-screenshot-baseline.sh\`
- Lighthouse: \`scripts/generate-local-lighthouse-evidence.sh\`
- Dependency audit: \`scripts/run-dependency-security-scan.sh\`
- API contracts: \`scripts/collect-api-contract-evidence.sh\`
- Architecture docs: \`docs/architecture\`
- Security evidence: \`docs/audit\`
- Uptime evidence: \`external-monitoring-status.sh.log\`
- Usability/pilot evidence: evidence slots only until real artifacts exist.

## Secret Policy

This report excludes .env files and does not print tokens, webhook secrets, Stripe secrets, SMTP passwords, or encrypted secret material.
EOF

if grep -R -E 'sk_live_|sk_test_|whsec_|STRIPE_[A-Z_]*SECRET|platformSecretEncrypted|webhookSecretEncrypted|smtpPasswordEncrypted' "${OUT_ROOT}" >/dev/null 2>&1; then
  echo "SaaS ops report secret scan failed." >&2
  exit 1
fi

echo "SaaS ops report generated: ${REPORT}"
