# Product-Wide Media Rendering Audit

## Findings

Media rendering was duplicated across tenant settings, sidebar identity, public booking, trade portal, payment request, customer portal, artifacts, and job media surfaces.

Business logos were the highest-risk path because the same `logoUrl` value is used by both authenticated and public/customer-facing surfaces.

## Shared Resolver

Added `app/lib/media.ts` with `resolveMediaUrl`.

The resolver handles:

- `blob:` and `data:` preview URLs.
- Relative controlled API media paths.
- Legacy absolute `api.mytitan.co.uk` logo URLs.
- Same-origin `/api` proxy routing in the browser.

Added `app/components/media/SafeImage.tsx` for deterministic fallback on missing or broken images.

## Remaining Follow-Up

Job evidence, asset photos, trade portal logos, payment request logos, and customer portal logos should continue migrating to `resolveMediaUrl`/`SafeImage` as those surfaces are next edited. This pass updated the launch-blocking business logo surfaces and public booking path.
