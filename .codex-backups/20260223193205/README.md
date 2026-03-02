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

###  seed (safe/idempotent)

```bash
cd /opt/mytitan/api
node scripts/seed-.js
node scripts/seed-.js --interactive-reset
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

## Onboarding + Integrations (Feature-flagged)

MyTitan can guide new tenants through a 6-step onboarding wizard when
`MYTITAN_FEATURE_MARKETPLACE=on`:
1) Branding (logo + colors)
2) Email support details
3) Catalog service setup
4) Booking hours + public booking toggle
5) Billing setup
6) Go Live (optional integrations)

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
