# rc16 Current Work Preservation

Date: 2026-07-13

Repository: `/opt/mytitan`

Branch: `release/v1.0.0-clean`

Starting HEAD: `b0a91da2be01830d49cd13454bb88a9d41761825`

Existing local candidate: `v1.0.0-rc15`

Safety archive: `/tmp/mytitan-rc16-preserve-20260713T194029Z`

The archive contains:

- `tracked.patch`
- `staged.patch`
- `status-short.txt`
- `diff-stat.txt`
- `untracked-files.txt`
- `untracked-files.tar.gz`

## Worktree Classification

### Sidebar Identity

- `app/components/nav/sidebar.tsx`
- `app/e2e/sidebar-navigation.spec.ts`

Purpose: tenant sidebar now leads with the business logo/initials/profile fallback, expanded/mobile sidebar shows MyTitan plus the business name, and Platform Admin identity remains MyTitan-first.

### Media / Upload

- `api/src/common/image-upload-validation.ts`
- `api/src/tenant/tenant.controller.ts`
- `api/src/tenant/tenant.service.ts`
- `app/lib/media.ts`
- `app/components/media/SafeImage.tsx`
- `app/pages/portal/booking/[...booking].tsx`
- `app/e2e/final-real-world-acceptance.spec.ts`

Purpose: validate PNG/JPEG/WebP uploads by decoded content, generate opaque public-logo references, resolve media URLs consistently, and render safe image fallbacks.

### Contrast / Design System

- `app/styles/globals.css`
- `app/e2e/sidebar-navigation.spec.ts`

Purpose: improve shared dark-surface contrast and add computed-style coverage for representative sidebar and product surfaces.

### Settings Save State

- `app/pages/dashboard/settings.tsx`

Purpose: make Settings dirty/save state derive from editable form state versus a canonical saved payload, with the successful save baseline reset from the server-confirmed response.

### Tests

- `app/e2e/final-real-world-acceptance.spec.ts`
- `app/e2e/sidebar-navigation.spec.ts`

Purpose: cover secure logo upload rejection paths, opaque logo URLs, white-label sidebar identity, fallback behavior, Platform Admin identity, and contrast.

### Documentation

- `docs/audit/business-logo-pipeline-root-cause.md`
- `docs/audit/global-media-contrast-baseline.md`
- `docs/audit/product-wide-contrast-root-cause.md`
- `docs/audit/product-wide-media-rendering-audit.md`
- `docs/audit/production-media-readonly-audit.md`
- `docs/architecture/business-logo-source-of-truth.md`
- `docs/operations/business-logo-repair-runbook.md`
- `docs/audit/rc16-current-work-preservation.md`

Purpose: record the media, logo, contrast, readonly production-media audit, repair runbook, and rc16 preservation evidence.

### Unrelated / Pre-existing

No unrelated source changes were identified in the current `git status --short` output. Existing running containers/processes were not treated as worktree changes.

## Tag Safety

Local release candidate tags present at baseline:

- `v1.0.0-rc15`
- `v1.0.0-rc14`
- `v1.0.0-rc13`
- `v1.0.0-rc12`
- earlier rc tags

`v1.0.0-rc15` must remain unchanged. `v1.0.0-rc16` must only be created after the committed source, focused checks, full isolated E2E, production-safety checks, live evidence, and clean worktree gates pass.
