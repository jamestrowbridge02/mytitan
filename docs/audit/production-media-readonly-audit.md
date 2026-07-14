# Production Media Read-Only Audit

No production mutation was performed.

The code audit identified the following metadata risks to check before launch operations:

- Legacy absolute API logo URLs.
- Legacy two-segment public-logo URLs containing tenant namespace path segments.
- Missing files for saved logo references.
- Zero-byte logo files.
- Mismatched extension and actual decoded image type.
- Stale browser/CDN cache on replaced logos.

Recommended read-only query/report fields:

- Count of tenant settings with non-empty logo references.
- Count by reference form: relative opaque path, legacy relative path, absolute API URL, external URL.
- Reachability status for each public-logo route.
- Content type and size class only. Do not print full tenant ids or private storage paths.

Repairs must follow the operator runbook and start in dry-run mode.
