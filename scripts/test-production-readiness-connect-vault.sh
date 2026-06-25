#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/mytitan"
SCRIPT="${BASE}/scripts/production-readiness-check.sh"
TEST_KEY="connect-vault-readiness-test-key"
PLATFORM_SECRET="sk_test_connect_vault_fixture_secret"
WEBHOOK_SECRET="whsec_connect_vault_fixture_secret"

encrypt_fixture() {
  local value="$1"
  INTEGRATIONS_ENCRYPTION_KEY="${TEST_KEY}" FIXTURE_VALUE="${value}" node -e '
const crypto = require("crypto");
const secret = String(process.env.INTEGRATIONS_ENCRYPTION_KEY || "").trim();
const value = String(process.env.FIXTURE_VALUE || "");
const key = crypto.createHash("sha256").update(secret).digest();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();
process.stdout.write(`${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`);
'
}

run_connect_only() {
  MYTITAN_READINESS_CONNECT_ONLY=1 \
    MYTITAN_READINESS_IGNORE_ENV_FILES=1 \
    "$@"
}

assert_contains() {
  local output="$1"
  local expected="$2"
  grep -Fq "${expected}" <<<"${output}" || {
    printf 'Expected output to contain: %s\n' "${expected}" >&2
    printf '%s\n' "${output}" >&2
    exit 1
  }
}

assert_redacted() {
  local output="$1"
  if grep -Eq 'sk_(test|live)_' <<<"${output}" || grep -Fq 'whsec_' <<<"${output}"; then
    printf 'Readiness output exposed a secret-looking value.\n' >&2
    printf '%s\n' "${output}" >&2
    exit 1
  fi
}

platform_encrypted="$(encrypt_fixture "${PLATFORM_SECRET}")"
webhook_encrypted="$(encrypt_fixture "${WEBHOOK_SECRET}")"

verified_row=$'test\t'"${platform_encrypted}"$'\t'"${webhook_encrypted}"$'\tverified\tverified'
verified_output="$(
  INTEGRATIONS_ENCRYPTION_KEY="${TEST_KEY}" \
    MYTITAN_READINESS_CONNECT_VAULT_ROW="${verified_row}" \
    run_connect_only bash "${SCRIPT}"
)"
assert_contains "${verified_output}" "STATE:ready"
assert_contains "${verified_output}" "SOURCE:vault"
assert_contains "${verified_output}" "PLATFORM_PRESENT:present"
assert_contains "${verified_output}" "WEBHOOK_PRESENT:present"
assert_contains "${verified_output}" "VERIFIED:yes"
assert_contains "${verified_output}" "MODE:test"
assert_redacted "${verified_output}"

unverified_row=$'test\t'"${platform_encrypted}"$'\t'"${webhook_encrypted}"$'\tneeds_verification\tneeds_verification'
unverified_output="$(
  INTEGRATIONS_ENCRYPTION_KEY="${TEST_KEY}" \
    MYTITAN_READINESS_CONNECT_VAULT_ROW="${unverified_row}" \
    run_connect_only bash "${SCRIPT}"
)"
assert_contains "${unverified_output}" "STATE:needs_verification"
assert_contains "${unverified_output}" "SOURCE:vault"
assert_contains "${unverified_output}" "VERIFIED:no"
assert_redacted "${unverified_output}"

undecryptable_row=$'test\tinvalid.encrypted.payload\t'"${webhook_encrypted}"$'\tverified\tverified'
undecryptable_output="$(
  INTEGRATIONS_ENCRYPTION_KEY="${TEST_KEY}" \
    MYTITAN_READINESS_CONNECT_VAULT_ROW="${undecryptable_row}" \
    run_connect_only bash "${SCRIPT}"
)"
assert_contains "${undecryptable_output}" "STATE:needs_verification"
assert_contains "${undecryptable_output}" "SOURCE:vault"
assert_contains "${undecryptable_output}" "PLATFORM_PRESENT:present"
assert_contains "${undecryptable_output}" "WEBHOOK_PRESENT:present"
assert_contains "${undecryptable_output}" "VERIFIED:no"
assert_redacted "${undecryptable_output}"

missing_output="$(run_connect_only bash "${SCRIPT}")"
assert_contains "${missing_output}" "STATE:needs_setup"
assert_contains "${missing_output}" "SOURCE:missing"
assert_contains "${missing_output}" "PLATFORM_PRESENT:missing"
assert_contains "${missing_output}" "WEBHOOK_PRESENT:missing"
assert_contains "${missing_output}" "VERIFIED:no"
assert_redacted "${missing_output}"

env_output="$(
  STRIPE_CONNECT_PLATFORM_SECRET="${PLATFORM_SECRET}" \
    STRIPE_CONNECT_WEBHOOK_SECRET="${WEBHOOK_SECRET}" \
    MYTITAN_TENANT_STRIPE_CONNECT_MODE=live \
    run_connect_only bash "${SCRIPT}"
)"
assert_contains "${env_output}" "STATE:ready"
assert_contains "${env_output}" "SOURCE:env"
assert_contains "${env_output}" "PLATFORM_PRESENT:present"
assert_contains "${env_output}" "WEBHOOK_PRESENT:present"
assert_contains "${env_output}" "VERIFIED:yes"
assert_contains "${env_output}" "MODE:live"
assert_redacted "${env_output}"

echo "production-readiness-connect-vault: ok"
