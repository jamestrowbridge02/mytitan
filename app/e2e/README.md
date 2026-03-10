# MyTitan Playwright E2E

This suite uses real app routes, real API auth, and deterministic local fixtures.

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
- deterministic bookings, billing, portal, technician, and command-centre records

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

## Overrides

If you need different credentials or API URLs, Playwright still supports:

- `PLAYWRIGHT_TEST_EMAIL`
- `PLAYWRIGHT_TEST_PASSWORD`
- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_API_BASE_URL`

These override the deterministic seeded defaults.
