# VPS service hygiene

Generated: 2026-06-29

## titan-tui audit

| Item | Result |
| --- | --- |
| Unit | `titan-tui.service` |
| Description | Titan Blessed TUI Dashboard |
| Unit file | `/etc/systemd/system/titan-tui.service` |
| WorkingDirectory | `/opt/titan-prod` |
| ExecStart | `/usr/bin/node /opt/titan-prod/titan-dashboard.js` |
| Environment files | `/opt/titan-prod/.env.live`, `/etc/titan/secrets.env` |
| Current path state | `/opt/titan-prod` does not exist |
| Failure mode | repeated `status=200/CHDIR` before application code starts |
| Restart policy | `Restart=always`, `RestartSec=2` |
| Observed impact | restart loop in systemd journal; unrelated to MyTitan Docker containers |
| MyTitan runtime dependency | none proven; app/api/marketing/postgres/redis run in Docker under `mytitan_*` containers |

## Decision

The service is obsolete or mispointed for the current MyTitan runtime. It references the missing legacy path `/opt/titan-prod` while the active runtime is Docker-based. It is safe to stop and disable this unit to remove systemd restart churn, provided no attempt is made to change Docker services, nginx, PostgreSQL, Redis, or application data.

## Action taken

`titan-tui.service` was disabled and stopped after documentation because it was continuously restarting against a missing working directory and had no proven dependency relationship with the MyTitan runtime.

## Verification

- Before action: enabled and active/restarting with `status=200/CHDIR`.
- Expected after action: disabled and inactive.
- MyTitan runtime services are separate Docker containers: `mytitan_api`, `mytitan_app`, `mytitan_marketing`, `mytitan_postgres`, `mytitan_redis`.

## Rollback

If the TUI is required later, restore the correct application directory and script, then re-enable explicitly:

```bash
systemctl enable --now titan-tui.service
systemctl status titan-tui.service
```

Do not point this service at MyTitan app/api containers unless a current operational owner signs off on the intended purpose.
