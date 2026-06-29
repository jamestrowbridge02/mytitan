# MyTitan Production Infrastructure Maintenance Readiness Audit

Generated: 2026-06-29 11:52 UTC
Host: srv1178818
Scope: infrastructure hardening, validation, cleanup planning, and maintenance preparation.

No destructive actions were performed. No packages were installed. No services were intentionally restarted. No Docker cleanup was executed. Secret values were not recorded in this document.

## 1 Server Health

- Host uptime: 48 days.
- OS: Ubuntu 24.04.4 LTS, kernel 6.8.0-111-generic.
- CPU: 4 vCPU AMD EPYC 9354P under KVM.
- Load: low at audit time.
- Memory: 15 GiB total, about 13 GiB available.
- Swap: none configured.
- Disk: root filesystem 193 GiB total, 155 GiB used, 39 GiB free, 81% used.
- Inodes: 11% used on root.
- Temperature: not available; `sensors` is not installed.
- Docker: 29.2.1.
- Docker Compose plugin: v5.0.2.
- PostgreSQL: 16.12.
- Redis: 7.4.7.
- nginx: 1.24.0.
- TLS certificate: valid until 2026-09-21 04:30:18 UTC.

Finding: root disk usage is high enough that Docker cleanup and build-cache policy should be handled before launch traffic increases.

## 2 Zombie Analysis

Five zombie `node` processes were present. Their parent is the `npm run start:prod` process inside the `mytitan_api` container.

Likely cause: short-lived Node subprocesses are exiting without being reaped by the npm parent process. This is consistent with validation or script execution from the API runtime.

Action taken: none.

Recommendation: do not kill zombie PIDs directly. Clear them with a controlled API container restart during an approved maintenance window, then consider replacing the npm parent with an exec-form Node entrypoint or init process such as `tini` so child processes are reaped correctly.

## 3 Package Audit

- Pending package upgrades: 63.
- Kept back packages: `cloud-init`, `fwupd`.
- Held packages: `cloud-init`.
- Reboot required: yes.
- Expected kernel: 6.8.0-124-generic.
- Running kernel: 6.8.0-111-generic.
- Services requiring restart include Docker, dbus, NetworkManager, systemd-logind, unattended-upgrades, and wpa_supplicant.
- Ubuntu Pro is not attached; 9 Universe/Multiverse security updates are pending without ESM Apps coverage.
- Unattended upgrades service is active and recent checks did not show a failed unattended-upgrade run.

Detailed package evidence is in `docs/audit/os-update-report.md`.

## 4 Docker Audit

Running containers:

- `mytitan_api`
- `mytitan_app`
- `mytitan_marketing`
- `mytitan_postgres`
- `mytitan_redis`

All containers were running with restart count 0. No Docker health checks are configured, so health is inferred from service checks rather than Docker health status.

Resource use was low at audit time. Docker reported substantial reclaimable build cache and image data:

- Build cache: about 137.1 GB reclaimable.
- Volumes: about 237.1 MB reclaimable.
- Images: Docker reported 129.5 GB reclaimable, but all current service images are active and must not be pruned blindly.

Container logs showed normal application traffic from validation activity. PostgreSQL logs contained expected duplicate-key messages from webhook idempotency tests, not crashes. Redis logs warned that host memory overcommit is disabled.

Security note: Docker container environment inspection contains secret-bearing configuration. Treat `docker inspect` output as privileged and redacted evidence. Do not store raw inspect output in tickets, logs, or docs.

## 5 PostgreSQL Audit

- Readiness: accepting connections.
- Database size: about 69 MB.
- Migration state: 92 applied, 0 pending or failed.
- Connections: low; active and idle connections were within the configured maximum of 100.
- Recovery mode: false.
- Deadlocks: 0.
- Conflicts: 0.
- Temporary files: 0.
- Waiting locks: none observed.
- Dead tuples: modest, with autovacuum active.
- Latest encrypted backup marker: 2026-06-29 03:00 UTC.
- Latest restore preview marker: 2026-05-16 09:13 UTC.

Finding: backups exist, but the restore preview marker is old for launch maintenance purposes. Run a fresh restore preview before package updates, Docker restart, or reboot.

## 6 Redis Audit

- Readiness: `PONG`.
- Mode: standalone.
- Memory use: about 1 MB.
- Rejected connections: 0.
- Error stats: 0.
- Evicted keys: 0.
- Persistence: AOF disabled; no explicit config file is loaded.
- Host `vm.overcommit_memory`: 0.

Finding: Redis warns that memory overcommit should be enabled. Set `vm.overcommit_memory=1` during maintenance after approval and preserve the setting in sysctl configuration.

## 7 nginx Audit

- `nginx -t`: successful.
- Service: active and enabled.
- HTTP to HTTPS redirects: working.
- HTTP/2: confirmed on public app/API endpoints.
- Compression: gzip is enabled, but gzip type configuration is basic.
- Cache headers: not explicitly enforced at nginx for audited responses.
- Security headers: incomplete at nginx/API layer.

Findings:

- nginx version is exposed in the `Server` header.
- App response exposes `X-Powered-By: Next.js`.
- API response exposes `X-Powered-By: Express`.
- HSTS was not observed.
- nginx config permits TLSv1 and TLSv1.1 in the global `ssl_protocols` line.

## 8 SSL Audit

- Certificate name: `mytitan.co.uk`.
- Covered domains: `mytitan.co.uk`, `api.mytitan.co.uk`, `app.mytitan.co.uk`, `www.mytitan.co.uk`.
- Issuer: Let's Encrypt.
- Expiry: 2026-09-21 04:30:18 UTC.
- Validity remaining at audit time: about 83 days.
- Public TLS checks: app and API negotiated TLSv1.3 and verified successfully.

Finding: certificate validity is acceptable, but nginx TLS protocol policy should be hardened to remove TLSv1 and TLSv1.1.

## 9 Security Audit

- UFW: active; default deny incoming, allow outgoing, deny routed.
- UFW allows SSH, HTTP, and HTTPS for IPv4 and IPv6.
- Fail2Ban: active with one `sshd` jail.
- SSH effective config: root login allowed, password authentication allowed, pubkey authentication allowed.
- npm audit: app and marketing have 0 vulnerabilities.
- npm audit: API has 2 moderate vulnerabilities through `js-yaml` via `@nestjs/swagger`; the automatic fix is breaking and was not applied.
- Secret scan: filename-only scan found secret-related configuration references in source, scripts, docs, and compose files; only `.env.example` is tracked as an env file.
- Hardcoded Stripe key guard from production readiness check: no real-looking hardcoded Stripe keys found in scanned source, scripts, or docs.

Findings:

- Disable SSH root login and password authentication only after confirming an alternate sudo-capable user with key access.
- Resolve or formally accept the API npm audit finding in a separate dependency maintenance change.
- Keep secret-bearing Docker/runtime inspection output out of permanent evidence.

## 10 Cleanup Candidates

No cleanup was executed.

Safe cleanup candidates after backup and service verification:

- Docker build cache: about 137.1 GB reclaimable.
- Inactive Docker volumes: about 237.1 MB reclaimable, pending name-by-name verification.
- Stale-looking Docker networks: `mytitan-release-clean_internal` and `repo_internal`, pending attachment verification.
- Automatically removable apt packages: `libslirp0`, `slirp4netns`.

Do not run broad image prune without reviewing image usage. Docker reported image reclaimability, but the current service images are active.

## 11 Maintenance Plan

Estimated downtime: 15-45 minutes, depending on package download/install time and reboot time.

Procedure:

1. Announce maintenance window.
2. Confirm current Git revision and deployed compose file.
3. Confirm fresh encrypted backup artifact.
4. Run a fresh restore preview.
5. Capture current Docker container state and resource use.
6. Place traffic in maintenance mode or stop external traffic if available.
7. Apply approved OS and Docker package updates.
8. Reboot to load the current kernel.
9. Confirm nginx, Docker, Fail2Ban, and UFW are active.
10. Start Docker Compose services in dependency order: Postgres, Redis, API, app, marketing.
11. Validate health, migrations, public routes, auth, Stripe, email, bundle, and stable suite.
12. Review logs for errors before reopening traffic.

Rollback:

- If package update fails before reboot, stop and inspect apt/dpkg state.
- If Docker fails after reboot, inspect Docker service and compose logs before changing data volumes.
- If app validation fails, keep traffic closed and restore the previous known-good deployment artifacts.
- If database corruption is suspected, do not start write traffic; restore from the verified encrypted backup into a separate target first.

## 12 Restart Readiness

Post-restart validation commands prepared, not all executed in this audit:

```bash
docker compose -p mytitan -f docker-compose.yml up -d
bash ./scripts/healthcheck.sh
bash ./scripts/production-readiness-check.sh
bash ./scripts/synthetic-public-checks.sh
bash ./scripts/verify-principal-admin-hash-stability.sh
bash ./scripts/stripe-deposit-refund-canary.sh
bash ./scripts/validate-e2e-stable.sh
```

Executed during this audit:

- `bash ./scripts/healthcheck.sh`: passed.
- `bash ./scripts/production-readiness-check.sh`: completed with core runtime ready and setup gaps listed below.
- `bash ./scripts/synthetic-public-checks.sh`: app login, API health, and marketing home ready; public booking skipped because no safe synthetic booking URL is declared.

## 13 Remaining Risks

- Reboot is required for kernel updates.
- Docker and other core services require restart.
- `titan-tui.service` is enabled and restart-looping against missing `/opt/titan-prod`.
- There are 13 failed systemd units, mostly Titan legacy/trading/summary units, outside the current MyTitan Docker runtime.
- Root disk is 81% used and Docker build cache is large.
- Redis host memory overcommit is disabled.
- SSH permits root login and password authentication.
- nginx/TLS/security headers need hardening.
- API dependency audit has 2 moderate vulnerabilities.
- Stripe Connect readiness remains incomplete in the production readiness check.
- No external uptime monitor is declared.
- Fresh restore preview should be run before maintenance.
- Host has both Docker Redis and a host Redis process, which should be reconciled or documented.

## 14 Final Verdict

NOT READY FOR MAINTENANCE.

The audit completed, and the core MyTitan Docker runtime is currently serving health checks. However, maintenance should not proceed until the owner explicitly approves the reboot/update window, a fresh restore preview is completed, the failed service noise is addressed or accepted, and the Docker cleanup plan is reviewed.

This phase does not certify public launch readiness.
