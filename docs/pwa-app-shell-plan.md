# MyTitan PWA / App-Shell Safety Plan

This is a plan only. It does not enable a service worker.

## Goal

Improve install reliability and perceived speed without caching authenticated, customer, payment, tenant, or API data.

## Safe scope

- Cache only static shell assets from the live app origin.
- Keep `site.webmanifest` support and install prompts.
- Keep signed-in routes network-first with no offline data persistence.
- Exclude customer pages, payment routes, auth routes, and API paths from all runtime caching.

## Non-negotiable exclusions

Never cache:

- `/api/*`
- authenticated HTML responses
- customer pages and secure links
- payment pages and payment confirmation responses
- tenant settings responses
- any bearer-token or session-derived response
- webhook or billing endpoints

## Safe first implementation

1. Cache static versioned assets only:
   - `/_next/static/*`
   - app icons
   - manifest
   - fonts served from the app origin
2. Use a short shell cache with version bump invalidation.
3. Keep HTML documents network-first.
4. Skip caching for any response with:
   - `set-cookie`
   - `authorization` request header
   - non-GET method
5. On logout:
   - clear service-worker-owned static caches
   - unregister old workers if policy changes
6. Keep install entry from `https://app.mytitan.co.uk` only.

## Route exclusions

- `/login`
- `/signup`
- `/dashboard/*`
- `/portal/*`
- `/complete/*`
- `/payments/*`
- `/billing/*`
- any URL with secure customer or job identifiers

## Future test plan

- install prompt still works from the live origin
- no `localhost` or Docker host references appear in manifest or worker
- signed-in pages still require network access
- logout does not leave authenticated UI reachable from cache
- payment and customer pages fail closed when offline
- only static hashed assets are cached
- public booking status and customer pages remain network-first
- billing, payments, customer, and job routes never serve from cache after logout
- dashboard shell does not persist tenant or auth responses between sessions
- service-worker registration is skipped entirely outside the live app origin

## Rollout gate

Do not ship a service worker until:

- cache rules are implemented exactly as above
- logout behavior is verified
- payment and customer page exclusions are covered by tests
- production readiness explicitly reports static-only caching mode
