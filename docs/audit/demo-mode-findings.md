# Demo Mode Findings

## Current Design
- Demo auth endpoint: `POST /public/demo-login`
  - File: `/opt/mytitan/api/src/public/public.controller.ts`
  - Gated by `isPublicDemoEnabled()`
  - Returns 404 when flag off
  - Rate-limited per IP in memory
  - Issues short-lived JWT (`30m`) with `demoUser: true`

- Marketing demo CTA:
  - File: `/opt/mytitan/marketing/pages/index.tsx`
  - `Try the demo` links to `https://app.mytitan.co.uk/login?demo=1` when demo flag is enabled in marketing build env

- App intake:
  - File: `/opt/mytitan/app/pages/login.tsx`
  - `?demo=1` triggers `/public/demo-login`, stores token, redirects to `/dashboard`

## Live Verification (smoke)
- Ran: `/opt/mytitan/scripts/demo-polish-smoke.sh`
- Observed:
  - `POST /public/demo-login` returned `200`
  - Script still printed `WARN: demo flag appears off; observed code=200`

## Root Cause Analysis for Warning
- Script logic issue in `/opt/mytitan/scripts/demo-polish-smoke.sh`:
  - It checks current shell env vars for demo flag.
  - It does **not** source `/opt/mytitan/.env`.
  - Runtime containers can have demo enabled while the shell env is unset.

Result:
- False warning in smoke output despite endpoint being operational.

## Other Demo Risks
1. In-memory rate limiter in API process (non-shared across replicas/restarts).
2. Demo token/session behavior depends on login query path; non-login direct links are less explicit.
3. Demo seed relies on `seed-demo.js`; operationally fine but should be part of documented release checklist.

## Safest Fix Path (no behavior change to runtime)
1. Script-only adjustment:
  - In `demo-polish-smoke.sh`, read demo flag from `/opt/mytitan/.env` (same style used by `release-smoke.sh`).
2. Keep endpoint check mandatory and authoritative (`200` or `429` accepted when enabled).
3. Maintain warning-only mismatch behavior (do not force FAIL), but print exact mismatch reason.

## Prioritized Next Actions
1. Patch smoke script env source mismatch.
2. Add smoke assertion for login demo flow URL path (`/login?demo=1` resolves to dashboard).
3. Consider Redis-backed rate limit for demo login if scaling beyond one API instance.
