# MyTitan Playwright E2E

This suite uses real app routes, real API auth, and deterministic local fixtures.

Playwright serves the app against a local API target and the browser uses the app's same-origin `/api` proxy.
Direct API helpers in the suite still talk to `http://127.0.0.1:3000` on purpose.
For a more first-class local stack, you can also start Docker with:

```bash
MYTITAN_API_PROXY_TARGET=http://api:3000 \
APP_PUBLIC_URL=http://127.0.0.1:3101 \
API_PUBLIC_URL=http://127.0.0.1:3000 \
CORS_ALLOWED_ORIGINS=http://127.0.0.1:3101 \
docker compose up -d app api
```

## Local workflow

1. Start the stack:

```bash
docker compose up -d app api
```

2. Seed the deterministic E2E workspace and operator:

```bash
docker compose exec -T api npm run seed:e2e
```

The seed creates:

- operator email: `e2e.operator@mytitan.local`
- operator password: `MyTitanE2E!2026`
- dispatcher email: `e2e.dispatcher@mytitan.local`
- finance email: `e2e.finance@mytitan.local`
- technician email: `e2e.technician@mytitan.local`
- viewer email: `e2e.viewer@mytitan.local`
- deterministic bookings, billing, portal, technician, and command-centre records

## Payments in local E2E

Customer-portal payment checks stay honest in local runs:

- if `STRIPE_SECRET_KEY` is absent, MyTitan reports payments as unavailable
- if `STRIPE_SECRET_KEY` is mistakenly set to a publishable `pk_...` key, the API now treats Stripe as unconfigured instead of failing noisily at runtime

This keeps public portal workflow coverage deterministic without faking payment success.

3. Run the suite:

```bash
cd app
npm run test:e2e
```

Or seed + run in one step:

```bash
cd app
npm run test:e2e:local
```

If your environment cannot bind the local Playwright Next server on `127.0.0.1:3101`, run against the existing Docker app/API stack instead:

```bash
cd app
npm run test:e2e:docker:local
```

## Stable release validation

For durable release proof, use the direct single-worker path against the existing Docker app/API services:

```bash
cd /opt/mytitan
bash ./scripts/validate-e2e-stable.sh
```

Equivalent app-local command:

```bash
cd /opt/mytitan/app
PLAYWRIGHT_USE_EXISTING_SERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
PLAYWRIGHT_API_BASE_URL=http://127.0.0.1:3000 \
NEXT_PUBLIC_MYTITAN_DISABLE_SSE=1 \
PLAYWRIGHT_SKIP_DOCKER_SEED=1 \
npx playwright test --workers=1 --reporter=line,json --output=/tmp/pw-results --timeout=0
```

Artifacts:
- log: `/tmp/mytitan-validation/full-suite-stable-<timestamp>.log`
- JSON report: `/tmp/pw-results/final-proof.json`
- explicit `EXIT_CODE:<n>` marker in the log

## Overrides

If you need different credentials or API URLs, Playwright still supports:

- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`
- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_API_BASE_URL`
- `PLAYWRIGHT_USE_EXISTING_SERVER=1`

These override the deterministic seeded defaults.
