# External monitoring

Use `scripts/external-monitoring-status.sh` to verify the public MyTitan surfaces without exposing secrets or private hostnames.

The script checks:

- `APP_PUBLIC_URL/login`
- `API_PUBLIC_URL/health`
- the derived marketing URL, or `MARKETING_PUBLIC_URL` if you declare one explicitly
- host nginx enabled/active state
- public app TLS expiry visibility
- whether a non-secret external monitor identifier is declared

Expected responses:

- app login: `200`, `301`, or `302`
- API health: `200`
- marketing home: `200`, `301`, or `302`

External monitor declaration:

- optional `MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME`
- optional `MYTITAN_EXTERNAL_UPTIME_MONITOR_URL`
- optional `MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER`
- optional `MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE`

These values are identifiers only. Do not place tokens, API keys, SMTP credentials, webhook secrets, or private hostnames in them.

If no external monitor identifier is declared, the script reports `not_configured` and points operators back to their host-level monitoring setup.

Readiness states:

- `not_configured`: no non-secret monitor identifier is visible.
- `configured`: a monitor is declared, but provider verification evidence has not been recorded.
- `verifying`: the monitor has been configured and is waiting for a verification window.
- `healthy`: the operator has confirmed the external monitor is reporting healthy.
- `degraded`: the monitor is configured but reporting an issue.

Suggested external monitors:

- Uptime Kuma:
  - add HTTP(s) monitors for `https://app.mytitan.co.uk/login`, `https://api.mytitan.co.uk/health`, and `https://mytitan.co.uk`
  - accept `200`, `301`, and `302` for app and marketing
  - accept `200` for API health
- Better Stack:
  - configure the same three URLs with the same expected status codes
  - tag the checks as `mytitan-app`, `mytitan-api`, and `mytitan-marketing`
- Pingdom:
  - use HTTPS checks against the same URLs
  - ensure redirects are followed for app and marketing

Optional non-secret declarations:

- `MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME=Uptime Kuma`
- `MYTITAN_EXTERNAL_UPTIME_MONITOR_URL=https://status.example.com/mytitan`
- `MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER=uptime-kuma`
- `MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE=verifying`

Do not place API keys, bearer tokens, SMTP credentials, webhook secrets, or internal hostnames in these values.
