# Platform server hygiene plan

Generated: 2026-06-29

No destructive cleanup, package upgrade, reboot, or Docker prune was executed.

## Current host snapshot

| Check | Result | Recommendation |
| --- | --- | --- |
| Disk | `/dev/sda1` 193G total, 156G used, 37G available, 81% used | schedule Docker cache cleanup after validation |
| Inodes | 11% used | no inode pressure |
| Memory | 15Gi total, 13Gi available | healthy |
| Swap | 0B | acceptable if memory remains healthy; document no swap |
| Docker containers | 5 active MyTitan containers | healthy enough for validation |
| Docker images | 130.5GB, 100% reclaimable reported | do not prune automatically; clean with approved maintenance window |
| Docker build cache | 138.2GB reclaimable | primary disk cleanup candidate |
| Docker volumes | 373.4MB total, 237.1MB reclaimable | inspect before pruning; preserve database volumes |
| Redis overcommit | `vm.overcommit_memory = 0` | set to `1` in a planned maintenance change if Redis warning appears |
| SSH | `PermitRootLogin yes`, `PasswordAuthentication yes` | harden after access review; prefer keys and disable password/root login |
| UFW | active; 22, 80, 443 allowed | acceptable baseline; review duplicate rules |
| Fail2Ban | active sshd jail | acceptable baseline |
| nginx | config test successful; service active | keep in validation path |
| titan-tui | obsolete/mispointed restart loop | disabled after audit |

## Safe cleanup plan

1. Confirm latest release evidence and backups are present.
2. Record `docker system df` before cleanup.
3. Remove unused build cache first during a maintenance window.
4. Inspect images before removing unused images.
5. Do not prune volumes unless each volume is mapped and confirmed non-production.
6. Re-run healthcheck, production readiness, and stable suite after cleanup.

## Update and reboot plan

1. Run package audit in simulation mode.
2. Review security updates and kernel updates.
3. Schedule downtime only if kernel or service restarts are required.
4. Take a database backup and restore preview before restart.
5. Restart order: PostgreSQL and Redis remain stable first, then API, app, marketing, then nginx reload if needed.
6. Rollback: return to prior image/tag, run `npx prisma migrate deploy` only for forward-safe migrations, then rerun healthcheck.

## Security hardening plan

- Review operators with SSH access.
- Move to key-only SSH and disable root login after confirming break-glass access.
- Keep UFW limited to SSH/HTTP/HTTPS.
- Keep Fail2Ban sshd jail enabled.
- Review nginx TLS/security headers as part of public launch evidence.
- Continue secret scans and do not commit `.env`.

## Backup and restore verification

- Run backup readiness script before maintenance.
- Perform restore preview in an isolated target.
- Record backup artifact age and restore result in release evidence.
- Do not delete old backup artifacts until new backup and restore preview are confirmed.

## Final note

The server is ready for a planned maintenance window, not automatically ready for public launch. Real production credentials, external monitoring evidence, backup/restore evidence, and final validation still determine launch readiness.
