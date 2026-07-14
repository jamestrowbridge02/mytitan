# Business Logo Repair Runbook

Use only with explicit operator approval.

## Dry Run

1. Export a read-only report of logo references.
2. Classify each reference as:
   - current opaque public-logo path
   - legacy public-logo path
   - absolute API URL
   - external URL
   - missing/malformed
3. Check file existence, size, content type, and decoded dimensions.
4. Redact tenant ids and private paths from operator-facing reports.

## Repair Options

- Convert a legacy absolute API URL to its relative controlled path when it points to MyTitan public-logo delivery.
- Re-upload a missing or corrupt logo from an operator-provided source file.
- Remove an invalid logo reference only when the operator explicitly confirms fallback behavior is acceptable.

## Required Audit Fields

- operator
- timestamp
- reason
- dry-run evidence
- target record class, not raw private path
- before/after reference class
- confirmation id

Never delete uploaded files automatically during discovery.
