# MyTitan (Operational Backbone)

Monorepo structure:
- `api/` NestJS + Prisma API
- `app/` Next.js web app

## Requirements
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

## Environment Variables

Set these before starting services.

### API (`/opt/mytitan/api`)
- `PORT=3000`
- `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME`
- `JWT_SECRET=replace_with_long_random_secret`
- `MYTITAN_FEATURE_MARKETPLACE=off` (feature flag for onboarding/marketplace/portal upgrades)
- `MYTITAN_FEATURE_START_HERE=off` (feature flag for Start Here routing + onboarding trade selection APIs)
- `MYTITAN_FEATURE_GUIDED_SETUP_V2=off` (feature flag for Guided Setup V2 APIs)
- `MYTITAN_FEATURE_PUBLIC_DEMO=off` (feature flag for `POST /public/demo-login`)
- `REDIS_URL=redis://HOST:6379` (optional but supported)
- `OPENAI_API_KEY=...` (required for `POST /ai/chat`; server-side only)
- `OPENAI_MODEL=gpt-4o-mini` (optional; defaults to `gpt-4o-mini`)
- `AI_RATE_LIMIT_MAX_REQUESTS=20` (optional)
- `AI_RATE_LIMIT_WINDOW_SECONDS=60` (optional)
- `TENANT_LOGO_MAX_BYTES=2097152` (optional upload cap)
- `API_PUBLIC_URL=https://api.mytitan.co.uk` (used for public logo URLs)
- `APP_PUBLIC_URL=https://app.mytitan.co.uk` (used for public portal redirects)
- `STRIPE_SECRET_KEY=...` (server-side only)
- `STRIPE_WEBHOOK_SECRET=...`
- `STRIPE_PRICE_SOLE_TRADER_MONTHLY=price_...`
- `STRIPE_PRICE_SOLE_TRADER_ANNUAL=price_...`
- `STRIPE_PRICE_BUSINESS_MONTHLY=price_...`
- `STRIPE_PRICE_BUSINESS_ANNUAL=price_...`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL=price_...`
- `STRIPE_BILLING_RETURN_URL=https://app.mytitan.co.uk/dashboard/billing`
- `INTEGRATIONS_ENCRYPTION_KEY=...` (AES-256-GCM secret for OAuth tokens)
- `XERO_CLIENT_ID=...`
- `XERO_CLIENT_SECRET=...`
- `XERO_REDIRECT_URL=https://api.mytitan.co.uk/integrations/xero/callback`
- `QBO_CLIENT_ID=...`
- `QBO_CLIENT_SECRET=...`
- `QBO_REDIRECT_URL=https://api.mytitan.co.uk/integrations/qbo/callback`
- `GOOGLE_OAUTH_CLIENT_ID=...`
- `GOOGLE_OAUTH_CLIENT_SECRET=...`
- `GOOGLE_OAUTH_REDIRECT_URL=https://api.mytitan.co.uk/integrations/google/callback`
- `BACKUP_ENCRYPTION_KEY=...` (host backups, not in containers)

### App (`/opt/mytitan/app`)
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`
- `NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE=off`
- `NEXT_PUBLIC_MYTITAN_FEATURE_START_HERE=off`
- `NEXT_PUBLIC_MYTITAN_FEATURE_GUIDED_SETUP_V2=off`
- `NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO=off`

## API Setup and Run

### Local development (`/opt/mytitan/api`)

Use `migrate dev` locally so Prisma can create/apply new migrations during development.

```bash
cd /opt/mytitan/api
npm install
export DATABASE_URL='postgresql://mytitan:mytitan@localhost:5432/mytitan'
export JWT_SECRET='change_me'
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate dev --schema=prisma/schema.prisma
npm run start:dev
```

### Server deploy (`/opt/mytitan`, Docker Compose)

Use `migrate deploy` in production. By default migrations are skipped at runtime; enable them explicitly when needed.

```bash
cd /opt/mytitan
# one-time or controlled migration run
RUN_MIGRATIONS=true docker compose up -d api
# normal start (no migrations)
docker compose up -d postgres redis
docker compose up -d api app
```

Recommended manual migration command:
```bash
cd /opt/mytitan/api
npx prisma migrate deploy --schema=prisma/schema.prisma
```

Health check:
```bash
curl http://localhost:3000/health
```

### Demo seed (safe/idempotent)

```bash
cd /opt/mytitan/api
node scripts/seed-demo.js
node scripts/seed-demo.js --interactive-reset
```

## Troubleshooting host curl

Use these commands to diagnose host-to-container health checks:

```bash
cd /opt/mytitan
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker exec mytitan_api bash -lc 'ss -lntp | grep :3000 || true'
ss -lntp | grep :3000 || true
env | egrep -i '^(http|https|no)_proxy=' || true
curl -4 -v --noproxy '*' http://127.0.0.1:3000/health
curl -v --noproxy '*' http://localhost:3000/health
```

Robust host health check command:

```bash
curl -4 --noproxy '*' -fsS http://127.0.0.1:3000/health
```

Final fix applied in this repo:
- API bootstrap now binds explicitly to all interfaces in the container: `await app.listen(port, '0.0.0.0');`
- Docker publishes API on host loopback (`127.0.0.1:3000`), so Nginx should proxy to `http://127.0.0.1:3000` (not `localhost`) to avoid IPv6 `::1` connection-refused behavior.

## Connectivity verification (curl anomaly)

Recommended verification command (Python stdlib, reliable fallback):

```bash
cd /opt/mytitan
./scripts/healthcheck.sh
```

Nginx proxy verification without DNS (Host-header test):

```bash
python3 - <<'PY'
import http.client
conn = http.client.HTTPConnection("127.0.0.1", 80, timeout=3)
conn.request("GET", "/health", headers={"Host": "api.mytitan.co.uk"})
r = conn.getresponse()
print(f"HTTP/{r.version/10:.1f} {r.status} {r.reason}")
print(r.read(1024).decode("utf-8", "replace"))
PY
```

What was observed:
- `python3`, `wget`, `busybox wget`, and current `curl` all reach `http://127.0.0.1:3000/health` with `HTTP/1.1 200 OK`.
- `curl --trace-ascii` shows normal connect/send/receive flow to `127.0.0.1:3000`.
- `strace` shows `socket(AF_INET)` + `connect(...127.0.0.1:3000...)` then `getsockopt(...SO_ERROR...) = 0`; no syscall-level connect failure was reproduced.

## App Setup and Run

```bash
cd /opt/mytitan/app
npm install
NEXT_PUBLIC_API_BASE_URL='http://localhost:3000' npm run dev
```

Open `http://localhost:3001` (or Next default port if 3001 is occupied).

## Marketing Site (Root Domain)

- Public marketing app lives in `marketing/` and runs on port `3002`.
- Nginx domain mapping:
  - `mytitan.co.uk` + `www.mytitan.co.uk` -> `127.0.0.1:3002` (marketing)
  - `app.mytitan.co.uk` -> `127.0.0.1:3001` (app)
  - `api.mytitan.co.uk` -> `127.0.0.1:3000` (api)

Docker service:
- `marketing` in `docker-compose.yml` (container `mytitan_marketing`)

## Onboarding + Integrations (Feature-flagged)

MyTitan can guide new tenants through a 7-step onboarding wizard when
`MYTITAN_FEATURE_MARKETPLACE=on`:
1) Branding (logo + colors)
2) Email support details
3) Choose a Trade Pack (optional)
4) Catalog service setup
5) Booking hours + public booking toggle
6) Billing setup
7) Go Live (optional integrations)

If onboarding is not complete, users are redirected to `/onboarding` after login.

### Setup checklist
The dashboard shows a Setup checklist until all key items are complete:
- Logo added
- Support email set
- At least one service created
- At least one integration enabled
- Booking hours configured
- At least one additional team member invited

### Integrations and plan rules
Integrations are available based on plan:
- Sole Trader: Payments + Bookings + AI
- Business: Payments + Bookings + Accounting + AI
- Enterprise: All + Social + Customer Portal + WhatsApp

Integrations are OFF by default and must be enabled per tenant.

### Reset onboarding (dev-only note)
If you need to reset onboarding for a tenant, set:
`onboardingCompleted=false` and `onboardingStep=0` on the tenant’s settings record in the database.

## Customer Portal + Bookings (Feature-flagged)
- Customer portal `/portal/job/[token]` supports approvals, signatures, and payments.
- Public booking portal `/portal/booking/[token]` offers a simple request flow.
- Booking settings live under `/dashboard/bookings` and include business hours and optional public booking links.

## Integrations (Foundation)
- Xero, QuickBooks Online, and Google Calendar OAuth foundations are exposed under `/integrations/*`.
- Tokens are encrypted at rest via `INTEGRATIONS_ENCRYPTION_KEY`.

## Production Verification Checklist

```bash
cd /opt/mytitan
docker compose up -d --build
docker compose ps
docker logs mytitan_api --tail=120
```

```bash
/opt/mytitan/scripts/healthcheck.sh
docker exec mytitan_api bash -lc 'python3 - <<'"'"'PY'"'"'
import urllib.request
print(urllib.request.urlopen("http://127.0.0.1:3000/health", timeout=3).read(1024).decode())
PY'
```

```bash
python3 - <<'PY'
import http.client
conn = http.client.HTTPConnection("127.0.0.1", 80, timeout=3)
conn.request("GET", "/health", headers={"Host": "api.mytitan.co.uk"})
r = conn.getresponse()
print(r.status, r.reason)
print(r.read(1024).decode("utf-8", "replace"))
PY
nginx -t && systemctl reload nginx
```

```bash
getent ahostsv4 api.mytitan.co.uk || true
getent ahostsv4 app.mytitan.co.uk || true
# only when BOTH resolve to 72.61.16.83:
certbot --nginx -d api.mytitan.co.uk -d app.mytitan.co.uk
certbot certificates || true
```

## Rollback Notes

- Code/config backups created by codex are stored under:
  - `/opt/mytitan/.codex-backups/<timestamp>/`
- Nginx root-domain mapping backups are stored under:
  - `/etc/nginx/sites-available/mytitan.co.uk.codex.<timestamp>.bak`

To roll back nginx mapping:
1. Copy backup over `/etc/nginx/sites-enabled/mytitan.co.uk`
2. Run `nginx -t`
3. Run `systemctl reload nginx`

## Stripe Setup

1) Create products/prices in Stripe Dashboard (Sole Trader, Business, Enterprise) with monthly + annual prices.
2) Set environment variables:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_SOLE_TRADER_MONTHLY`
- `STRIPE_PRICE_SOLE_TRADER_ANNUAL`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_BUSINESS_ANNUAL`
- `STRIPE_PRICE_ENTERPRISE_MONTHLY`
- `STRIPE_PRICE_ENTERPRISE_ANNUAL`
- `STRIPE_BILLING_RETURN_URL`
3) Add webhook endpoint in Stripe:
   - URL: `https://api.mytitan.co.uk/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Note: use `/stripe/webhook` in Stripe; `/billing/webhook` is a legacy alias.

Local webhook testing (optional):
```bash
# Use Stripe CLI to forward webhooks
stripe listen --forward-to http://127.0.0.1:3000/stripe/webhook
```

## Self-Service + AI Smoke Tests (curl)

```bash
TOKEN=$(curl -fsS http://127.0.0.1:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"change_me"}' \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')

curl -fsS http://127.0.0.1:3000/tenant/settings -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/catalog/items -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/tenant/email-templates -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/ai/chat -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"message":"Help me set up branding"}'
curl -fsS http://127.0.0.1:3000/onboarding/status -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/users -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/usage/me -H "Authorization: Bearer $TOKEN"
```

## Billing Smoke Tests (curl)

```bash
TOKEN=$(curl -fsS http://127.0.0.1:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"change_me"}' \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')

curl -fsS http://127.0.0.1:3000/billing/me -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/billing/portal -H "Authorization: Bearer $TOKEN"
curl -fsS http://127.0.0.1:3000/billing/checkout-session \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"planCode":"SOLE_TRADER","interval":"MONTHLY"}'
```

Plan codes and intervals:
- `SOLE_TRADER`, `BUSINESS`, `ENTERPRISE`
- `MONTHLY`, `ANNUAL`

## Backups

Daily encrypted backups are stored in `/opt/mytitan/backups` using `/opt/mytitan/scripts/backup.sh`.
Set `BACKUP_ENCRYPTION_KEY` in `/opt/mytitan/.env` (host).

Cron entry:
```
0 3 * * * root /opt/mytitan/scripts/backup.sh >/var/log/mytitan-backup.log 2>&1
```

Test restore preview:
```bash
/opt/mytitan/scripts/restore-test.sh
```

Notes:
- `POST /ai/chat` requires `OPENAI_API_KEY` set on the API server and `aiEnabled=true` for the tenant.
- If you need a first admin, call `POST /auth/signup` once and then login to get a token.

## Implemented API Endpoints

Company scoped from JWT `companyId`:
- `GET /health`
- `POST /auth/signup`
- `POST /auth/login`
- `GET /me`
- `POST /jobs`
- `GET /jobs`
- `GET /jobs/:id`
- `PATCH /jobs/:id/status`
- `POST /bookings`
- `GET /bookings?from=&to=`
- `POST /trade-accounts`
- `GET /trade-accounts`
- `GET /tenant/settings`
- `PUT /tenant/settings`
- `POST /tenant/settings/logo`
- `GET /tenant/public-logo/:tenantId/:fileName`
- `GET /catalog/items`
- `GET /catalog/items/:id`
- `POST /catalog/items`
- `PUT /catalog/items/:id`
- `DELETE /catalog/items/:id`
- `GET /tenant/email-templates`
- `GET /tenant/email-templates/:id`
- `POST /tenant/email-templates`
- `PUT /tenant/email-templates/:id`
- `DELETE /tenant/email-templates/:id`
- `POST /ai/chat`
- `POST /billing/checkout-session`
- `POST /billing/webhook`
- `GET /billing/portal`
- `GET /billing/me`
- `GET /onboarding/status`
- `POST /onboarding/complete`
- `GET /users`
- `POST /users/invite`
- `POST /users/accept-invite`
- `PATCH /users/:id/role`
- `GET /usage/me`
- `GET /audit`
- `GET /public/job/:token`
- `POST /public/job/:token/approve`
- `POST /public/job/:token/sign`

## Security and Domain Rules
- Passwords are hashed with bcrypt (`bcryptjs`).
- JWT guard protects company-scoped endpoints.
- Role guard enforces RBAC for mutating actions.
- Pricing totals are server-computed from labor/parts/misc/tax inputs.
- Audit events are written for:
  - signup
  - login
  - job creation
  - job status changes
  - booking creation
  - trade account upsert

## Frontend Routes
- `/signup`
- `/login`
- `/dashboard`
- `/dashboard/jobs`
- `/dashboard/jobs/new`
- `/dashboard/bookings`
- `/dashboard/trade-accounts`
- `/dashboard/settings`
- `/dashboard/catalog`
- `/dashboard/email-templates`
- `/dashboard/billing`
- `/dashboard/users`
- `/dashboard/audit`
- `/onboarding`
- `/portal/job/[token]`

## Tenant Settings Seed

If existing tenants were created before tenant settings existed, create defaults:

```bash
cd /opt/mytitan/api
npm run seed:tenant-settings
```

## OpenAI Security Note

- `OPENAI_API_KEY` must only exist on the API server environment.
- Do not put `OPENAI_API_KEY` in Next.js `NEXT_PUBLIC_*` variables or browser code.

## Trade Packs (Feature-flagged)
Enable Trade Packs with:
- `MYTITAN_FEATURE_TRADE_PACKS=on` (API)
- `NEXT_PUBLIC_MYTITAN_FEATURE_TRADE_PACKS=on` (app UI)

When enabled, `/dashboard/trade-packs` provides industry presets that can be installed per tenant.

Available packs:
- `WHEELS`: wheel/tyre catalog starter items, pricing presets, quote/email copy, booking defaults.
- `BODYSHOP`: body repair catalog starter items, damage checklist, quote/email copy, booking defaults.
- `GARAGE`: garage service catalog starter items, service reminder copy, pricing presets, booking defaults.
- `MOBILE_TECH`: mobile callout starter items, customer ETA messaging copy, pricing presets, booking defaults.

Plan limits:
- Sole Trader: up to 1 pack
- Business: up to 2 packs
- Enterprise: unlimited

API endpoints (auth required):
- `GET /trade-packs`
- `GET /trade-packs/installed`
- `POST /trade-packs/install` body `{ "packCode": "WHEELS" }`
- `POST /trade-packs/uninstall` body `{ "packCode": "WHEELS" }`

Install flow is idempotent and additive:
- Seeds catalog defaults if missing
- Seeds pricing/checklist/email/pdf/booking/portal presets
- Never deletes tenant custom edits on uninstall (soft disable only)

## Start Here (Feature-flagged)
Enable Start Here guided routing with:
- `MYTITAN_FEATURE_START_HERE=on` (API)
- `NEXT_PUBLIC_MYTITAN_FEATURE_START_HERE=on` (app UI)

Behavior when enabled:
- After login, users with incomplete onboarding are sent to `/onboarding`.
- After login, users with completed onboarding are sent to `/start`.
- `/start` shows simple action cards:
  - Create a Job
  - Create a Booking Link
  - Customer Portal
  - Integrations Marketplace

Trade-pack-first onboarding:
- First onboarding step asks trade type: `WHEELS`, `BODYSHOP`, `GARAGE`, `MOBILE`.
- Selection installs the matching Trade Pack and stores selected trade.
- Changing trade updates defaults and does not delete existing tenant data.

New API endpoints (auth required):
- `GET /onboarding/trade`
- `POST /onboarding/select-trade` body `{ "trade": "WHEELS" | "BODYSHOP" | "GARAGE" | "MOBILE" }`

## Guided Setup V2 (Feature-flagged)

Enable Guided Setup V2 with:
- `MYTITAN_FEATURE_GUIDED_SETUP_V2=on` (API)
- `NEXT_PUBLIC_MYTITAN_FEATURE_GUIDED_SETUP_V2=on` (app UI)

Routes (auth required):
- `GET /guided-setup/status`
- `POST /guided-setup/step` body `{ "step": number, "data": object, "skipped": boolean }`
- `POST /guided-setup/reset` (OWNER only, resets progress and `guidedSetupCompletedAt`)
- `POST /guided-setup/complete`

Wizard entry points:
- `/dashboard/setup-wizard`
- `/dashboard/settings` → “Run guided setup again”
- `/dashboard/setup` → “Open guided setup”

Behavior:
- Guided setup is a soft flow (no forced redirect away from `/dashboard`).
- Banner/progress cards appear on `/dashboard`, `/dashboard/setup`, and `/dashboard/settings` when setup is incomplete.
- Users can always create jobs while setup is incomplete.
- Wizard progress is persisted server-side (`currentStep`, `completedSteps[]`, `skippedSteps[]`, `completedAt`).

Disable Guided Setup V2:
- Set `MYTITAN_FEATURE_GUIDED_SETUP_V2=off`
- Set `NEXT_PUBLIC_MYTITAN_FEATURE_GUIDED_SETUP_V2=off`

Reset setup for one tenant (OWNER token required):
1. `POST /guided-setup/reset`
2. Open `/dashboard/setup-wizard` to resume from step 1

Smoke check (optional):
```bash
API_TOKEN=... /opt/mytitan/scripts/guided-setup-smoke.sh
```

## Tenant Theme Mode (Light/Dark)

- `TenantSetting.themeMode` is tenant-scoped and defaults to `light`.
- API:
  - `GET /tenant/settings` includes `themeMode`
  - `PATCH /tenant/settings` accepts `{ "themeMode": "light" | "dark" }`
- UI:
  - `/dashboard/settings` -> Appearance -> Light/Dark toggle
  - Theme is applied globally using the `dark` class on `document.documentElement`
  - If unset/unknown, app falls back to light mode

## Public Demo Mode (Feature-flagged)

Enable demo mode:
- `MYTITAN_FEATURE_PUBLIC_DEMO=on`
- `NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO=on`

Demo flow:
1. Marketing CTA “Try the demo” goes to `https://app.mytitan.co.uk/login?demo=1`
2. App login page calls `POST /public/demo-login`
3. API returns a short-lived JWT (30 minutes) for `demo@mytitan.co.uk`
4. Token is stored in browser local storage (`mytitan_token`) and user is redirected to dashboard

Flag behavior:
- OFF: `POST /public/demo-login` returns `404`
- ON: `POST /public/demo-login` returns `200` JSON token payload

Seed demo data (idempotent):
```bash
cd /opt/mytitan/api
node scripts/seed-demo.js
```
Seed includes demo tenant users, service catalog, pricing preset, trade accounts, 10 demo customers, 10 demo jobs (with Wheels formData/assets), and bookings.


## Wheels Job Form v1 (Feature-flagged)

Enable Wheels Job Form v1 with:

```bash
MYTITAN_FEATURE_WHEELS_FORM_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_WHEELS_FORM_V1=on
```

What it does:
- Adds a metadata-driven Wheels job form at `/dashboard/jobs/new` when `primaryTrade=WHEELS`.
- Exposes authenticated template endpoint: `GET /templates/default?trade=WHEELS`.
- Stores Wheels job payload in `Job.formData` with derived columns (`tradeCode`, `jobType`, totals).
- Stores normalized evidence assets in `JobAsset` and generated job summary PDF metadata in `JobPdf`.
- Adds tokenized PDF access route: `GET /public/job/:token/pdf`.

Smoke tests:

```bash
cd /opt/mytitan
docker compose up -d --build
docker exec mytitan_api bash -lc 'cd /app && npx prisma migrate deploy --schema=prisma/schema.prisma'
/opt/mytitan/scripts/healthcheck.sh
curl -fsS https://api.mytitan.co.uk/health
curl -I https://app.mytitan.co.uk
curl -s -o /dev/null -w "%{http_code}
" https://api.mytitan.co.uk/templates/default?trade=WHEELS
curl -s -o /dev/null -w "%{http_code}
" -X POST https://api.mytitan.co.uk/jobs/invalid/pdf
```


## Wheels Automation v1 (Feature-flagged)

Enable Wheels Automation v1 with:

```bash
MYTITAN_FEATURE_WHEELS_AUTOMATION_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_WHEELS_AUTOMATION_V1=on
```

What it does:
- Adds an Automation card on `/dashboard/jobs/new` for Wheels tenants.
- Adds `Mark Job Complete` one-click flow: sets completion date, prepares WhatsApp copy, submits job, generates PDF, and opens WhatsApp best-effort after success.
- Adds authenticated pricing preset endpoint: `GET /pricing-presets` (returns `name`, `unitPrice`, `useCount`).
- Keeps existing guided and non-guided flows intact when the flag is off.

Notes:
- Email sending remains optional; if not configured, UI shows: `Email sending not set up yet`.
- `POST /jobs/:id/pdf` returns both `url` (relative) and `pdfUrl` (public URL when `API_PUBLIC_URL` is set).

## Release Smoke Script

Run:

```bash
cd /opt/mytitan
./scripts/release-smoke.sh
```

This script checks:
- container state (`docker compose ps`)
- API health with retry
- app + marketing public HEAD responses
- webhook routes return non-404
- demo-login response when demo flag is on
- billing route reachability

Result output:
- `PASS` (exit `0`)
- `WARN` (exit `0`)
- `FAIL` (exit `1`)

## Final Polish Flags

Set these in `/opt/mytitan/.env` for this release:

```bash
MYTITAN_FEATURE_COMMAND_CENTRE=on
NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE=on
MYTITAN_FEATURE_CRM_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_CRM_V1=on
MYTITAN_FEATURE_DRAFTS_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_DRAFTS_V1=on
MYTITAN_FEATURE_AUTH_POLISH_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_AUTH_POLISH_V1=on
MYTITAN_FEATURE_MARKETING_POLISH_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_MARKETING_POLISH_V1=on
```

## OPS Suite V1 Flags

```bash
MYTITAN_FEATURE_COMMAND_CENTRE_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE_V1=on
MYTITAN_FEATURE_LOCATIONS_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_LOCATIONS_V1=on
MYTITAN_FEATURE_INVENTORY_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_INVENTORY_V1=on
MYTITAN_FEATURE_LOGOUT_V1=on
NEXT_PUBLIC_MYTITAN_FEATURE_LOGOUT_V1=on
```

## OPS Suite V1 Routes and Pages

API (auth required):
- `GET /locations`
- `POST /locations`
- `PATCH /locations/:id`
- `POST /locations/:id/archive`
- `GET /me/location`
- `PUT /me/location`
- `GET /jobs/board`
- `POST /jobs/bulk`
- `PATCH /jobs/:id`
- `GET /inventory/items`
- `POST /inventory/items`
- `PATCH /inventory/items/:id`
- `GET /inventory/levels`
- `POST /inventory/movements`
- `GET /inventory/purchase-orders`
- `POST /inventory/purchase-orders`
- `PATCH /inventory/purchase-orders/:id`
- `POST /inventory/purchase-orders/:id/receive`
- `POST /inventory/items/:id/allocate-to-job`
- `POST /auth/logout`

App pages:
- `/dashboard/command-centre`
- `/dashboard/locations`
- `/dashboard/inventory`
- `/dashboard/admin`

## 5-Minute Operator Checklist

1. Open `/dashboard/command-centre`, filter jobs, bulk change status on two jobs.
2. Open `/dashboard/locations`, create a location, set it active in header picker.
3. Open `/dashboard/inventory`, create one item, add movement, verify stock level updates.
4. Create a job in `/dashboard/jobs/new`, add one part in “Parts/Stock used”, submit.
5. Use “Sign out” in the dashboard header and confirm redirect to `/login`.

Ops smoke:

```bash
cd /opt/mytitan
./scripts/ops-smoke.sh
```

## Top 1% Modules (Feature-flagged)

New flags (default `off` in `.env.example`):

```bash
MYTITAN_FEATURE_COMMAND_CENTRE_PREMIUM_V1=off
NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE_PREMIUM_V1=off
MYTITAN_FEATURE_GUIDED_EVERYWHERE_V1=off
NEXT_PUBLIC_MYTITAN_FEATURE_GUIDED_EVERYWHERE_V1=off
MYTITAN_FEATURE_AUTH_SECURITY_V1=off
NEXT_PUBLIC_MYTITAN_FEATURE_AUTH_SECURITY_V1=off
MYTITAN_FEATURE_LOCATIONS_ADVANCED_V1=off
NEXT_PUBLIC_MYTITAN_FEATURE_LOCATIONS_ADVANCED_V1=off
MYTITAN_FEATURE_INVENTORY_PRO_V1=off
NEXT_PUBLIC_MYTITAN_FEATURE_INVENTORY_PRO_V1=off
```

Optional SMTP env names:

```bash
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

What was added:
- Command Centre Premium: saved views API/UI, multi-location filtering, side panel, inline edits, undo endpoint (`POST /jobs/undo-last`), keyboard shortcuts.
- Guided Everywhere: `/dashboard/guided` launcher and guided/skip workflows for job, booking, payment, inventory receive/allocate, and customer messaging.
- Auth Security: forgot/reset/verify email flows, auth-guarded resend verification, sign out all sessions (`POST /auth/logout-all`) via `tokenVersion`, owner-visible last login in users view.
- Locations Advanced: location hours, timezone, lead time, default assignee, staff-location assignment, staff restriction toggle.
- Inventory Pro: low stock alerts (`GET /inventory/alerts`), valuation (`GET /inventory/valuation`), quick reorder drafts, guided receive flow, allocate-to-job line items.

Top1 smoke:

```bash
cd /opt/mytitan
./scripts/top1-smoke.sh
```
