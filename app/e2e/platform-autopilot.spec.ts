import { expect, test } from "@playwright/test";
import { fixtureRefs, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function apiLogin(request: Parameters<typeof test>[0]["request"], email: string, password: string) {
  const response = await requestLocalApi(request, "/auth/login", {
    method: "POST",
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("platform Autopilot", () => {
  test("platform admin can view health, sentinels, manual actions, and alert ownership", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform/autopilot", { waitUntil: "networkidle" });

    await expect(page.getByTestId("platform-autopilot-control-centre")).toBeVisible();
    await expect(page.getByTestId("autopilot-section-system-health")).toBeVisible();
    await expect(page.getByTestId("autopilot-card-api")).toContainText(/healthy|degraded|attention needed|down/i);
    await expect(page.getByTestId("autopilot-availability-targets")).toContainText(/Runtime availability|Public endpoint availability|Operational readiness|Launch readiness/i);
    await expect(page.getByTestId("autopilot-availability-calculation")).toContainText(/required runtime checks healthy/i);
    await expect(page.getByTestId("autopilot-booking-calendar-health")).toContainText(/Booking visibility|Calendar route|Connected Tools actions|Public portal support wording/i);
    await expect(page.getByTestId("autopilot-manual-actions")).toContainText(/Stripe Connect|External uptime|Legal review|Tax compliance|Data residency/i);
    await expect(page.getByTestId("autopilot-alert-queue")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/platformSecretEncrypted|webhookSecretEncrypted|STRIPE_CONNECT_PLATFORM_SECRET|STRIPE_CONNECT_WEBHOOK_SECRET|sk_live_|whsec_/);
  });

  test("tenant roles cannot access Autopilot APIs or diagnostics", async ({ request }) => {
    const deniedUsers = [
      [fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword],
      [fixtureRefs.financeEmail, fixtureRefs.financePassword],
      [fixtureRefs.dispatcherEmail, fixtureRefs.dispatcherPassword],
      [fixtureRefs.externalOperatorEmail, fixtureRefs.externalOperatorPassword],
    ];
    for (const [email, password] of deniedUsers) {
      const token = await apiLogin(request, email, password);
      const response = await requestLocalApi(request, "/admin/platform/autopilot", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect([401, 403]).toContain(response.status());
    }
  });

  test("availability scoring excludes optional and operational readiness from runtime downtime", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const response = await requestLocalApi(request, "/admin/platform/autopilot?force=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const calculation = body.monitoring?.overall?.calculation;
    expect(calculation).toEqual(expect.objectContaining({
      numerator: expect.any(Number),
      denominator: expect.any(Number),
      requiredKeys: expect.arrayContaining(["app", "api", "marketing", "database", "redis", "web-gateway", "tls"]),
      excludedKeys: expect.arrayContaining(["backups", "restore-drill", "billing", "job-packs"]),
    }));
    expect(calculation.denominator).toBe(7);
    expect(body.monitoring?.externalMonitoring?.status || "not_configured").toMatch(/not_configured|configured|verifying|ready|healthy|degraded|unknown/);
    expect(calculation.requiredKeys).not.toContain("external_uptime_monitor");
    expect(calculation.excludedKeys).toEqual(expect.arrayContaining(["scheduler", "backups", "restore-drill", "billing", "job-packs"]));
    expect(String(body.monitoring?.externalMonitoring?.summary || "")).toMatch(/does not replace it|External uptime monitoring/i);
  });

  test("runtime diagnostics expose Redis and gateway evidence without secrets", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const response = await requestLocalApi(request, "/admin/platform/autopilot?force=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const services = new Map((body.monitoring?.services || []).map((row: any) => [row.key, row]));
    const redis = services.get("redis") as any;
    expect(redis).toEqual(expect.objectContaining({
      detail: expect.stringMatching(/PONG|Redis/i),
      responseTimeMs: expect.any(Number),
    }));
    if (redis?.state === "healthy") {
      expect(redis.evidence).toEqual(expect.objectContaining({
        response: "PONG",
        latencyMs: expect.any(Number),
        lastChecked: expect.any(String),
      }));
    }
    expect(services.get("web-gateway")).toEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        app: expect.any(Object),
        api: expect.any(Object),
        marketing: expect.any(Object),
      }),
    }));
    const tls = services.get("tls") as any;
    expect(tls?.evidence).toHaveProperty("tlsStatus");
    expect(JSON.stringify(body)).not.toMatch(/sk_live_|whsec_|bookingPublicToken|smtpPasswordEncrypted|platformSecretEncrypted|webhookSecretEncrypted/);
  });

  test("Autopilot sentinels report booking and trade blockers with safe actions", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const run = await requestLocalApi(request, "/admin/platform/autopilot/sentinels/run", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {},
    });
    expect(run.ok()).toBeTruthy();
    const body = await run.json();
    const byKey = new Map((body.results || []).map((row: any) => [row.key, row]));
    expect(byKey.get("booking_visibility")).toEqual(expect.objectContaining({
      detail: expect.stringMatching(/tenant ownership|Masked orphan sample|ownership evidence/i),
      nextAction: expect.stringMatching(/No action required|audited repair|do not auto-assign/i),
    }));
    expect(byKey.get("public_booking_availability")).toEqual(expect.objectContaining({
      detail: expect.stringMatching(/Root cause:|token=redacted|publishedServices|bookingHours|routeStatus/i),
      nextAction: expect.stringMatching(/publication|public services|booking hours|public route/i),
    }));
    expect(byKey.get("trade_portal_access")).toEqual(expect.objectContaining({
      detail: expect.stringMatching(/without returning tokens|No-token state is acceptable|scoped trade account access/i),
      nextAction: expect.stringMatching(/No action required|unpublished by design|audited trade account invite/i),
    }));
  });

  test("safe self-heal requires platform admin confirmation and writes before-after audit evidence", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const beforeCounts = await requestLocalApi(request, "/admin/platform/autopilot", { headers });
    expect(beforeCounts.ok()).toBeTruthy();

    const unconfirmed = await requestLocalApi(request, "/admin/platform/autopilot/actions", {
      method: "POST",
      headers,
      data: { action: "clear_payment_readiness_cache", confirmation: false },
    });
    expect(unconfirmed.status()).toBe(400);

    const action = await requestLocalApi(request, "/admin/platform/autopilot/actions", {
      method: "POST",
      headers,
      data: { action: "clear_payment_readiness_cache", confirmation: true },
    });
    expect(action.ok()).toBeTruthy();
    const body = await action.json();
    expect(body).toMatchObject({
      ok: true,
      action: "clear_payment_readiness_cache",
      productionDataDeleted: false,
      stripeCatalogMutated: false,
      secretsReturned: false,
    });
    expect(body.before).toEqual(expect.objectContaining({ alertCount: expect.any(Number) }));
    expect(body.after).toEqual(expect.objectContaining({ alertCount: expect.any(Number) }));
    expect(body.eventId).toBeTruthy();
  });

  test("sentinels persist recent failure contracts without mutating production or Stripe catalog", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const run = await requestLocalApi(request, "/admin/platform/autopilot/sentinels/run", {
      method: "POST",
      headers,
      data: {},
    });
    expect(run.ok()).toBeTruthy();
    const body = await run.json();
    const byKey = new Map((body.results || []).map((row: any) => [row.key, row]));
    for (const key of [
      "booking_visibility",
      "calendar_v2_route",
      "stripe_connect_onboarding",
      "payment_readiness_truth",
      "statement_feedback",
      "public_portal_wording",
      "connected_tools_actions",
      "theme_persistence",
      "logo_selection",
      "customer_email_route",
      "trade_portal_access",
      "tenant_platform_boundary",
    ]) {
      expect(byKey.has(key)).toBe(true);
    }
    expect(byKey.get("booking_visibility")).toEqual(expect.objectContaining({ checkedAt: expect.any(String), owner: "Bookings" }));
    expect(byKey.get("calendar_v2_route")).toEqual(expect.objectContaining({ nextAction: expect.any(String), checkedAt: expect.any(String) }));
    expect(byKey.get("connected_tools_actions")).toEqual(expect.objectContaining({ summary: expect.stringMatching(/empty href|without empty hrefs/i) }));
    expect(byKey.get("public_portal_wording")).toEqual(expect.objectContaining({ summary: expect.stringMatching(/support wording/i) }));
  });

  test("commercial controls remain available after Autopilot recovery actions", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const response = await requestLocalApi(request, "/admin/platform/tenants/e2e-company/commercial-controls", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      controls: expect.objectContaining({
        paused: expect.any(Boolean),
      }),
      allowance: expect.objectContaining({
        summary: expect.objectContaining({
          monthlyIncludedAllowance: expect.any(Number),
        }),
      }),
      auditHistory: expect.any(Array),
    }));
  });

  test("platform alert queue supports audited acknowledge, snooze, and resolve lifecycle", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const created = await requestLocalApi(request, "/admin/platform/autopilot/alerts", {
      method: "POST",
      headers,
      data: {
        severity: "warning",
        summary: "E2E platform operations alert",
        detail: "Lifecycle verification alert.",
        owner: "Platform QA",
        nextAction: "Verify lifecycle transitions.",
        affectedRef: "e2e-system",
        reason: "E2E alert lifecycle validation",
        confirmation: true,
      },
    });
    expect(created.ok()).toBeTruthy();
    const alertId = String((await created.json()).alertId || "");
    expect(alertId).toBeTruthy();

    for (const [action, snoozedUntil] of [
      ["acknowledge", undefined],
      ["snooze", new Date(Date.now() + 60 * 60 * 1000).toISOString()],
      ["resolve", undefined],
    ] as const) {
      const updated = await requestLocalApi(request, `/admin/platform/autopilot/alerts/${alertId}`, {
        method: "PATCH",
        headers,
        data: {
          action,
          snoozedUntil,
          reason: `E2E confirmed ${action} lifecycle transition`,
          confirmation: true,
        },
      });
      expect(updated.ok()).toBeTruthy();
      expect((await updated.json()).after.lifecycle.state).toBe(action === "acknowledge" ? "acknowledged" : action === "snooze" ? "snoozed" : "resolved");
    }
  });
});
