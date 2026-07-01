#!/usr/bin/env bash
set -euo pipefail

API_CONTAINER="${MYTITAN_API_CONTAINER:-mytitan_api}"

capture_failure() {
  local output status
  set +e
  output="$("$@" 2>&1)"
  status=$?
  set -e
  if [[ "${status}" -eq 0 ]]; then
    echo "BOUNDARY_TEST_FAIL: command unexpectedly succeeded: $*" >&2
    exit 1
  fi
  printf '%s' "${output}"
  return 0
}

seed_output="$(capture_failure docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npm run seed:e2e')"
if ! printf '%s' "${seed_output}" | grep -qi 'refused:'; then
  echo "BOUNDARY_TEST_FAIL: production seed did not refuse with boundary message" >&2
  exit 1
fi

docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npm run auth:verify-user-password-hash-stability' >/dev/null
docker exec -w /app "${API_CONTAINER}" /bin/sh -lc 'npm run platform:verify-protected-records' >/dev/null

echo "BOUNDARY_TEST_PASS: production fixture mutation refused and protected records verified"
