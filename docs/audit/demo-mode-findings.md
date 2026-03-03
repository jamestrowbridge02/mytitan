#  Mode Findings

## Current Design
-  auth endpoint: `POST /public/-login`
  - File: `/opt/mytitan/api/src/public/public.controller.ts`
  - Gated by `legacy public demo gate`
  - Returns 404 when flag off
  - Rate-limited per IP in memory
  - Issues short-lived JWT (`30m`) with `demoUser: true`

- Marketing  CTA:
  - File: `/opt/mytitan/marketing/pages/index.tsx`
  - `Try the ` links to `https://app.mytitan.co.uk/login?=1` when  flag is enabled in marketing build env

- App intake:
  - File: `/opt/mytitan/app/pages/login.tsx`
  - `?=1` triggers `/public/-login`, stores token, redirects to `/dashboard`

## Live Verification (smoke)
- Ran: `/opt/mytitan/scripts/-polish-smoke.sh`
- Observed:
  - `POST /public/-login` returned `200`
  - Script still printed `WARN:  flag appears off; observed code=200`

## Root Cause Analysis for Warning
- Script logic issue in `/opt/mytitan/scripts/-polish-smoke.sh`:
  - It checks current shell env vars for  flag.
  - It does **not** source `/opt/mytitan/.env`.
  - Runtime containers can have  enabled while the shell env is unset.

Result:
- False warning in smoke output despite endpoint being operational.

## Other  Risks
1. In-memory rate limiter in API process (non-shared across replicas/restarts).
2.  token/session behavior depends on login query path; non-login direct links are less explicit.
3.  seed relies on `seed-.js`; operationally fine but should be part of documented release checklist.

## Safest Fix Path (no behavior change to runtime)
1. Script-only adjustment:
  - In `-polish-smoke.sh`, read  flag from `/opt/mytitan/.env` (same style used by `release-smoke.sh`).
2. Keep endpoint check mandatory and authoritative (`200` or `429` accepted when enabled).
3. Maintain warning-only mismatch behavior (do not force FAIL), but print exact mismatch reason.

## Prioritized Next Actions
1. Patch smoke script env source mismatch.
2. Add smoke assertion for login  flow URL path (`/login?=1` resolves to dashboard).
3. Consider Redis-backed rate limit for  login if scaling beyond one API instance.
