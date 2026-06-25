# Summary Dispatch Scheduling

MyTitan does not schedule workspace summaries on its own. Production must enable a scheduler explicitly.

## Host Runner

Use the host-level helper to run summary dispatch through the API container with durable logs:

```bash
bash ./scripts/run-summary-dispatch.sh daily
bash ./scripts/run-summary-dispatch.sh weekly
bash ./scripts/run-summary-dispatch.sh monthly
bash ./scripts/run-summary-dispatch.sh quarterly
bash ./scripts/run-summary-dispatch.sh annual
```

Each run writes a log under `/tmp/mytitan-validation/` and exits non-zero if the API service is down, system sender readiness fails, or one or more tenant dispatches fail.

## Cron Examples

Example crontab entries:

```cron
15 6 * * * /bin/bash /opt/mytitan/scripts/run-summary-dispatch.sh daily
30 6 * * 1 /bin/bash /opt/mytitan/scripts/run-summary-dispatch.sh weekly
45 6 1 * * /bin/bash /opt/mytitan/scripts/run-summary-dispatch.sh monthly
0 7 1 1,4,7,10 * /bin/bash /opt/mytitan/scripts/run-summary-dispatch.sh quarterly
15 7 1 1 * /bin/bash /opt/mytitan/scripts/run-summary-dispatch.sh annual
```

## systemd Example

Repo assets:

```bash
deploy/systemd/mytitan-summary@.service
deploy/systemd/mytitan-summary-daily.timer
deploy/systemd/mytitan-summary-weekly.timer
deploy/systemd/mytitan-summary-monthly.timer
deploy/systemd/mytitan-summary-quarterly.timer
deploy/systemd/mytitan-summary-annual.timer
```

Install units onto a host:

```bash
sudo bash ./scripts/install-summary-scheduler.sh
sudo ENABLE_TIMERS=1 bash ./scripts/install-summary-scheduler.sh
```

Check status without exposing secrets:

```bash
bash ./scripts/summary-scheduler-status.sh
```

Template service:

```ini
[Unit]
Description=MyTitan summary dispatch (%i)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/mytitan
ExecStart=/opt/mytitan/scripts/run-summary-dispatch.sh %i
```

Timer example:

```ini
[Unit]
Description=Run MyTitan daily summary dispatch

[Timer]
OnCalendar=*-*-* 06:00:00 UTC
Persistent=true
Unit=mytitan-summary@daily.service

[Install]
WantedBy=timers.target
```

## Readiness Notes

- The dispatch command uses the MyTitan system sender for summary emails.
- Workspace-level summary settings still decide whether a tenant is enabled for a given cadence.
- The scheduler should be considered inactive until cron or systemd is actually installed and enabled in production.
- The log output is safe to collect. It does not print SMTP credentials, tokens, or recipient secrets.
- Each timer exits non-zero when dispatch fails readiness checks or tenant delivery fails, so host monitoring can alert on the service result.
