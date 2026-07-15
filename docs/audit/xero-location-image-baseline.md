# Xero and Location Image Baseline

- Branch: `release/v1.0.0-clean`
- Baseline HEAD: `b6c1d33cc2515a2bc0c6c981f165db055d9e449d`
- Existing candidate tag: `v1.0.1-rc2`
- Worktree before edits: clean tracked tree

## Xero Surface

- Tenant directory: `app/pages/dashboard/integrations.tsx`
- Tenant setup route: `app/pages/dashboard/settings/integrations/[provider].tsx`
- API controller: `api/src/integrations/integrations.controller.ts`
- API service/source of truth: `api/src/integrations/integrations.service.ts`
- Authoritative model: `IntegrationConnection`
- Organisation selection: `GET /integrations/xero/organisations`, `POST /integrations/xero/organisations/select`

## Location Image Surface

- Tenant page: `app/pages/dashboard/locations.tsx`
- Shared upload component: `app/components/media/EntityImageUpload.tsx`
- API endpoint: `POST /locations/:id/image`
- Multipart field: `file`
- Persisted field: `Location.metadataJson.imageUrl`
- Public media route: `/tenant/public-booking-media/:companyId/:fileName`

