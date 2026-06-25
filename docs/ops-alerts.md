# Operational Alert Routing

MyTitan can route sanitized operational alerts to:

- active verified workspace owner/admin users, resolved automatically
- optional extra ops email recipients configured in `Settings -> Email & Notifications`
- optional critical-only platform copies from `MYTITAN_OPS_ALERT_RECIPIENTS` when explicitly enabled server-side

External ops email always uses the MyTitan system sender. Tenant business alerts do not require manually maintaining future business email lists.

## Supported categories

- `failed_email`
- `failed_summary_dispatch`
- `failed_booking`
- `failed_payment`
- `failed_refund`
- `failed_webhook`
- `failed_backup`
- `health_degraded`

## Readiness

Dashboard settings reads:

- `GET /notifications/ops-alerts/status`

This exposes only safe status:

- system sender readiness
- automatic owner/admin recipient count
- optional extra recipient count
- resolved recipient count
- platform recipient count
- enabled categories

It does not expose SMTP secrets, recipient addresses, Stripe keys, or private URLs.

## Routing rules

- Active verified owner/admin users are included automatically for tenant operational alerts.
- Removed, disabled, unverified, or non-owner/admin users stop receiving tenant operational alerts automatically.
- Extra ops recipients are optional and follow the enabled category filters in settings.
- Non-routable domains such as `.local`, `.test`, and `localhost` are suppressed.
- Platform/support recipients are excluded from normal tenant business alerts and can receive only opted-in critical platform copies.

## Healthcheck integration

Existing health probes can raise a sanitized workspace alert:

```bash
bash ./scripts/healthcheck.sh http://127.0.0.1:3000/health \
  || bash ./scripts/report-health-degraded.sh <tenant-id> "API healthcheck failed."
```

The health degradation helper sends:

- reason key `health_degraded`
- severity `critical`
- MyTitan system-sender alert email to configured ops recipients

Backup or restore monitoring can raise the backup category by using a reason key that contains `backup` or `restore`.

## Notes

- External ops email supplements in-app/internal notifications. It does not replace them.
- Customer-facing refund/payment emails remain workspace-sender-first with MyTitan fallback where the product already supports it.
