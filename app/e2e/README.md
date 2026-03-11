# MyTitan Playwright E2E

This suite uses real app routes, real API auth, and deterministic local fixtures.

Playwright serves the app with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000`.
The proxy helper still normalizes browser API traffic during local runs because the container API can otherwise keep production-shaped CORS and host defaults unless you explicitly override them.
For a more first-class local stack, you can also start Docker with:

```bash
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

## Overrides

If you need different credentials or API URLs, Playwright still supports:

- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`
- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_API_BASE_URL`
- `PLAYWRIGHT_USE_EXISTING_SERVER=1`

These override the deterministic seeded defaults.
