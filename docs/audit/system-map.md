# System Map (MyTitan)

## 1) Repository Structure
- Root: `/opt/mytitan`
- Core services:
  - API (NestJS + Prisma): `/opt/mytitan/api`
  - App (Next.js pages router): `/opt/mytitan/app`
  - Marketing site (Next.js): `/opt/mytitan/marketing`
- Infra/runtime:
  - Docker Compose: `/opt/mytitan/docker-compose.yml`
  - Nginx site configs: `/etc/nginx/sites-enabled/mytitan`, `/etc/nginx/sites-enabled/mytitan.co.uk`
- Ops scripts:
  - `/opt/mytitan/scripts/release-smoke.sh`
  - `/opt/mytitan/scripts/ops-smoke.sh`
  - `/opt/mytitan/scripts/ops-core-smoke.sh`
  - `/opt/mytitan/scripts/demo-polish-smoke.sh`
  - `/opt/mytitan/scripts/healthcheck.sh`

## 2) Docker Compose Services
Source: `/opt/mytitan/docker-compose.yml`

- `postgres` (PostgreSQL 16)
- `redis` (Redis 7)
- `api` (NestJS, binds `127.0.0.1:3000`)
  - depends_on: `postgres`, `redis`
- `app` (Next.js app, binds `127.0.0.1:3001`)
  - depends_on: `api`
- `marketing` (Next.js marketing, binds `127.0.0.1:3002`)

Dependency graph:
- `postgres` <- `api`
- `redis` <- `api`
- `api` <- `app`
- `marketing` independent (served via root domain)

## 3) Nginx Routing
Sources:
- `/etc/nginx/sites-enabled/mytitan`
- `/etc/nginx/sites-enabled/mytitan.co.uk`

Routing:
- `api.mytitan.co.uk` -> `http://127.0.0.1:3000`
- `app.mytitan.co.uk` -> `http://127.0.0.1:3001`
- `mytitan.co.uk`, `www.mytitan.co.uk` -> `http://127.0.0.1:3002`
- HTTP (80) redirects to HTTPS (443)

TLS:
- Uses cert paths under `/etc/letsencrypt/live/mytitan.co.uk/`.

## 4) High-level Request Flow
- Browser -> Nginx -> `app`/`marketing` for UI
- App/Marketing -> API (`NEXT_PUBLIC_API_BASE_URL`)
- API -> Postgres/Redis/Stripe/OpenAI/SMTP (feature and config dependent)

## 5) API Module Map
Source folder: `/opt/mytitan/api/src`

Primary modules:
- `auth`, `tenant`, `jobs`, `bookings`, `billing`, `public`
- `trade-accounts` (including `crm.controller.ts`)
- `command-centre`, `locations`, `inventory`, `notifications`
- `onboarding`, `guided-setup`, `integrations`, `usage`, `metrics`, `audit`

Module wiring root: `/opt/mytitan/api/src/app.module.ts`.

## Prioritized Next Actions
1. Add an architecture diagram to docs showing domain boundaries (booking/job/crm/billing/public).
2. Introduce a single source of truth for public domain routing docs (Nginx + Compose + app env).
3. Add module ownership metadata (maintainer, test coverage, risk level) per API module.
