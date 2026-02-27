# Feature Flags Inventory

Sources:
- API flags: `/opt/mytitan/api/src/common/feature-flags.ts`
- App flags: `/opt/mytitan/app/lib/feature-flags.ts`
- Env definitions: `/opt/mytitan/.env.example`
- Compose wiring: `/opt/mytitan/docker-compose.yml`

## Flag Families

### Platform/Core
- `*_MARKETPLACE`
- `*_TRADE_PACKS`
- `*_START_HERE`

### Trade/Wheels
- `*_WHEELS_FORM_V1`
- `*_WHEELS_AUTOMATION_V1`
- `*_PORTAL_POLISH_V1`

### Guided setup/demo
- `*_GUIDED_SETUP_V2`
- `*_PUBLIC_DEMO`
- `*_DEMO_TOUR_V1`
- `*_DEMO_POLISH_V1`

### Command centre/CRM/drafts
- `*_COMMAND_CENTRE`
- `*_COMMAND_CENTRE_V1`
- `*_COMMAND_CENTRE_PREMIUM_V1`
- `*_COMMAND_CENTRE_V2`
- `*_CRM_V1`
- `*_CRM_PRO_V1`
- `*_DRAFTS_V1`

### Booking/locations/inventory
- `*_BOOKING_PRO_V1`
- `*_LOCATIONS_V1`
- `*_LOCATIONS_ADVANCED_V1`
- `*_INVENTORY_V1`
- `*_INVENTORY_PRO_V1`

### Auth/notifications/marketing
- `*_AUTH_POLISH_V1`
- `*_AUTH_SECURITY_V1`
- `*_LOGOUT_V1`
- `*_MEDIA_SIGNATURE_V1`
- `*_NOTIFICATIONS_V1`
- `*_MARKETING_POLISH_V1`

## Where Flags Are Enforced

API patterns:
- Hard-gate with `requireXEnabled()` (throws 503 when off) on selected endpoints.
- Soft-gate in some controllers returning fallback payloads (e.g., empty arrays, `{ok:false}`) instead of 503.

Examples:
- `requireCommandCentreV2Enabled()` in `jobs.controller.ts` and `board-views.controller.ts`
- `requireBookingProV1Enabled()` in `booking-pro.controller.ts`
- `requireCrmProV1Enabled()` in `crm.controller.ts`
- `requireNotificationsV1Enabled()` in `notifications.controller.ts`
- `isInventoryV1Enabled()` soft-fallbacks in `inventory.controller.ts`

App patterns:
- Centralized helpers in `app/lib/feature-flags.ts`
- Flag-based nav/page behavior in `components/dashboard-shell.tsx` and individual pages.

## Findings
1. Mixed hard/soft gating semantics across modules increase UI/API contract complexity.
2. Some features are effectively on/off both by global env flag and tenant subscription feature guard (`FeatureGuard`), creating dual gating.
3. `demo-polish-smoke.sh` does not read `.env`, it checks shell env only.

## Demo Smoke Warning Root Cause
Warning observed:
- `WARN: demo flag appears off; observed code=200`

Likely cause:
- In `scripts/demo-polish-smoke.sh`, branch logic uses process env vars:
  - `MYTITAN_FEATURE_PUBLIC_DEMO`
  - `NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO`
- If these are not exported in the shell, script assumes “off” even when container runtime `.env` has demo enabled.
- Endpoint result (`200`) proves server flag path is actually enabled.

Safe fix path (reversible):
1. Align demo-polish smoke with release-smoke behavior by reading `/opt/mytitan/.env` for demo flag state.
2. Keep endpoint check as source of truth; treat mismatch as `WARN` with actionable message.
3. Do not alter runtime flags automatically in smoke scripts.

## Prioritized Next Actions
1. Standardize hard-gate vs soft-gate policy and document by module.
2. Add a generated flags matrix (flag -> API endpoints -> UI pages).
3. Fix `demo-polish-smoke.sh` env-source mismatch (script-only change).
