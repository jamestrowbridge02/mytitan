import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("integration platform foundation", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("Connected Tools renders tenant-safe readiness without operational diagnostics", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/integrations");

    await expect(page.getByTestId("integrations-workspace-section")).toBeVisible();
    await expect(page.getByTestId("integration-admin-health")).toHaveCount(0);
    await expect(page.getByTestId("integration-owner-command")).toHaveCount(0);
    await expect(page.getByTestId("integration-workspace-row-quickbooks")).toContainText(/Connected|Available|Setup required|Requires external account|Needs attention|Not available/i);
    await expect(page.locator("body")).not.toContainText(/OAuth verified|idempotency|provider mutation|metadata.only/i);
  });

  test("provider-specific deep links land on exact readiness and connection rows", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/integrations", { waitUntil: "domcontentloaded" });
    const quickbooksRow = page.getByTestId("integration-workspace-row-quickbooks");
    await expect(quickbooksRow).toBeVisible();
    await quickbooksRow.getByRole("link").click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/integrations\/quickbooks/);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/integrations", { waitUntil: "domcontentloaded" });
    const googleRow = page.getByTestId("integration-personal-row-google");
    await expect(googleRow).toBeVisible();
    const box = await googleRow.boundingBox();
    expect(box && box.y).toBeGreaterThan(32);
  });

  test("Xero tenant setup uses authoritative state and safe organisation selection", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    const status = await requestLocalApi(request, "/integrations/xero/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(status.ok()).toBeTruthy();
    const payload = await status.json();
    expect(payload.tokensReturnedToClient).toBe(false);
    expect(payload.externalTenantId).toBeNull();
    expect(["setup_needed", "select_organisation", "needs_reconnect", "ready"]).toContain(payload.connectionState);
    expect(payload.setupAvailable).toBe(true);

    await page.goto("/dashboard/integrations");
    const xeroRow = page.getByTestId("integration-workspace-row-xero");
    await expect(xeroRow).toBeVisible();
    await expect(xeroRow).toContainText(/Xero/);
    await expect(xeroRow).toContainText(/Available|Connected|Setup required|Action required/);
    await expect(xeroRow).not.toContainText(/tenantId|organisation ID|access token|refresh token/i);

    await xeroRow.getByRole("link").click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/integrations\/xero/);
    await expect(page.getByTestId("provider-setup-wizard")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/access token|refresh token|tenant id|encrypted/i);
  });

  test("personal integration status is scoped to the current user only", async ({ request }) => {
    const operatorLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
      headers: { "Content-Type": "application/json" },
    });
    expect(operatorLogin.ok()).toBeTruthy();
    const operatorToken = String((await operatorLogin.json())?.token || "");

    const adminLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.workspaceAdminEmail, password: fixtureRefs.workspaceAdminPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(adminLogin.ok()).toBeTruthy();
    const adminToken = String((await adminLogin.json())?.token || "");

    const [operatorStatus, adminStatus, opsOverview] = await Promise.all([
      requestLocalApi(request, "/integrations/google/status", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      }),
      requestLocalApi(request, "/integrations/google/status", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      requestLocalApi(request, "/integrations/ops", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      }),
    ]);

    expect(operatorStatus.ok()).toBeTruthy();
    expect(adminStatus.ok()).toBeTruthy();
    expect(opsOverview.ok()).toBeTruthy();

    const operatorJson = await operatorStatus.json();
    const adminJson = await adminStatus.json();
    const opsJson = await opsOverview.json();
    const googleRow = Array.isArray(opsJson?.providers)
      ? opsJson.providers.find((row: any) => row.provider === "GOOGLE_CALENDAR")
      : null;

    expect(operatorJson.ownership).toBe("personal");
    expect(operatorJson.connected).toBe(true);
    expect(adminJson.ownership).toBe("personal");
    expect(adminJson.connected).toBe(false);
    expect(Number(googleRow?.connectedUserCount || 0)).toBeGreaterThanOrEqual(1);
  });

  test("integration rollout monitoring exposes safe counts only", async ({ request }) => {
    const operatorLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
      headers: { "Content-Type": "application/json" },
    });
    expect(operatorLogin.ok()).toBeTruthy();
    const operatorToken = String((await operatorLogin.json())?.token || "");

    const monitoring = await requestLocalApi(request, "/integrations/rollout-monitoring", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    expect(monitoring.ok()).toBeTruthy();

    const payload = await monitoring.json();
    expect(payload.windowDays).toBe(7);
    expect(payload.counts).toMatchObject({
      personalIntegrationSaveFailures: expect.any(Number),
      workspaceIntegrationSaveFailures: expect.any(Number),
      encryptionReadinessFailures: expect.any(Number),
      crossScopeAccessAttempts: expect.any(Number),
      providerSetupErrors: expect.any(Number),
    });
    expect(JSON.stringify(payload)).not.toContain("sk_live_");
    expect(JSON.stringify(payload)).not.toContain("sk_test_");
    expect(JSON.stringify(payload)).not.toContain("whsec_");
  });

  test("API token creation reveals the token once", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/settings/developer-tools");

    await page.getByLabel("Token name").fill("Playwright token");
    await page.getByRole("button", { name: "Create token", exact: true }).click();

    await expect(page.getByText(/Copy this token now/)).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "mtit_" }).first()).toBeVisible();
    await expect(page.getByText("Playwright token").first()).toBeVisible();
  });

  test("webhook actions reflect the dedicated integrations key readiness", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/settings/developer-tools");

    const guidance = page.getByTestId("integration-encryption-guidance");
    const createButton = page.getByTestId("integration-webhook-create");
    if (!(await createButton.isEnabled())) {
      await expect(guidance).toContainText(/platform administrator/i);
      await expect(createButton).toBeDisabled();
      return;
    }

    await expect(guidance).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("INTEGRATIONS_ENCRYPTION_KEY");
    await expect(createButton).toBeEnabled();
  });

  test("failed webhook deliveries reflect webhook-secret readiness safely", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/settings/developer-tools");

    const retryButton = page.getByTestId(/integration-delivery-retry-/).first();
    await expect(retryButton).toBeVisible({ timeout: 10000 });
    const guidance = page.getByTestId("integration-encryption-guidance");
    const retryEnabled = await retryButton.isEnabled();

    if (!retryEnabled) {
      await expect(retryButton).toBeDisabled();
      await expect(guidance).toContainText(/platform administrator/i);
      return;
    }

    await expect(guidance).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("INTEGRATIONS_ENCRYPTION_KEY");
    await expect(retryButton).toBeEnabled();
  });

  test("seeded delivery logs are visible", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/settings/developer-tools");

    await expect(page.getByText(fixtureRefs.seededWebhookName).first()).toBeVisible();
    await expect(page.getByTestId("integration-delivery-log-row").first()).toBeVisible();
    await expect(page.getByText("Job created").first()).toBeVisible();
    await expect(page.getByText("Automation Rule Ran").first()).toBeVisible();
  });

  test("viewers see readiness but cannot manage webhook configuration", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);
    await page.goto("/dashboard/integrations");

    await expect(page.getByTestId("integration-admin-health")).toHaveCount(0);
    await expect(page.getByTestId("integrations-governance-readonly")).toBeVisible();
    await expect(page.getByTestId("integration-webhook-create")).toHaveCount(0);
    await expect(page.getByTestId("integration-api-token-create")).toHaveCount(0);
  });

  test("BYOG API returns safe tenant-scoped readiness without secrets", async ({ request }) => {
    const operatorLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
      headers: { "Content-Type": "application/json" },
    });
    expect(operatorLogin.ok()).toBeTruthy();
    const operatorToken = String((await operatorLogin.json())?.token || "");

    const adminLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.workspaceAdminEmail, password: fixtureRefs.workspaceAdminPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(adminLogin.ok()).toBeTruthy();
    const adminToken = String((await adminLogin.json())?.token || "");

    const [operatorByog, adminByog, personalGoogle] = await Promise.all([
      requestLocalApi(request, "/integrations/byog", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      }),
      requestLocalApi(request, "/integrations/byog", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      requestLocalApi(request, "/integrations/byog/google-calendar?scope=personal", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      }),
    ]);

    expect(operatorByog.ok()).toBeTruthy();
    expect(adminByog.ok()).toBeTruthy();
    expect(personalGoogle.ok()).toBeTruthy();

    const operatorJson = await operatorByog.json();
    const adminJson = await adminByog.json();
    const personalJson = await personalGoogle.json();
    const serialized = JSON.stringify({ operatorJson, adminJson, personalJson });

    expect(serialized).not.toContain("encryptedSecretMaterial");
    expect(serialized).not.toContain("encryptedPayload");
    expect(serialized).not.toContain("qbo_e2e_webhook_secret");
    expect(serialized).not.toContain("google_e2e_personal_refresh");

    const stripeRow = operatorJson.find((row: any) => row.provider === "stripe-customer-payments");
    const quickbooksRow = adminJson.find((row: any) => row.provider === "quickbooks");
    expect(stripeRow?.status).toBe("disabled");
    expect(quickbooksRow?.connected).toBe(true);
    expect(personalJson).toMatchObject({ provider: "google-calendar" });
    expect(typeof personalJson.ok).toBe("boolean");
  });

  test("disabled BYOG clients fail closed and cross-tenant routes stay isolated", async ({ request }) => {
    const operatorLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
      headers: { "Content-Type": "application/json" },
    });
    expect(operatorLogin.ok()).toBeTruthy();
    const operatorToken = String((await operatorLogin.json())?.token || "");

    const supportLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.supportOwnerEmail, password: fixtureRefs.supportOwnerPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(supportLogin.ok()).toBeTruthy();
    const supportToken = String((await supportLogin.json())?.token || "");

    try {
      const disabledSave = await requestLocalApi(request, "/integrations/byog/generic-api", {
        method: "PUT",
        headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
        data: { scope: "workspace", status: "DISABLED" },
      });
      expect(disabledSave.ok()).toBeTruthy();

      const [disabledClient, operatorByog, supportByog] = await Promise.all([
        requestLocalApi(request, "/integrations/byog/generic-api?scope=workspace", {
          headers: { Authorization: `Bearer ${operatorToken}` },
        }),
        requestLocalApi(request, "/integrations/byog", {
          headers: { Authorization: `Bearer ${operatorToken}` },
        }),
        requestLocalApi(request, "/integrations/byog", {
          headers: { Authorization: `Bearer ${supportToken}` },
        }),
      ]);

      expect(disabledClient.ok()).toBeTruthy();
      expect(await disabledClient.json()).toMatchObject({ ok: false, category: "disabled" });

      const operatorPayload = await operatorByog.json();
      const supportPayload = await supportByog.json();
      expect(JSON.stringify(operatorPayload)).not.toContain("e2esupportroute001");
      expect(JSON.stringify(supportPayload)).toContain("e2esupportroute001");
    } finally {
      await requestLocalApi(request, "/integrations/byog/generic-api?scope=workspace", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${operatorToken}` },
      });
    }
  });

  test("orchestration map stays redacted, tenant-scoped, and blocked for technician or customer access", async ({ request }) => {
    const [operatorLogin, supportLogin, technicianLogin, customerLogin] = await Promise.all([
      request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
        data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
        headers: { "Content-Type": "application/json" },
      }),
      request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
        data: { email: fixtureRefs.supportOwnerEmail, password: fixtureRefs.supportOwnerPassword },
        headers: { "Content-Type": "application/json" },
      }),
      request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
        data: { email: fixtureRefs.technicianEmail, password: fixtureRefs.technicianPassword },
        headers: { "Content-Type": "application/json" },
      }),
      request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/customer-auth/login`, {
        data: { email: fixtureRefs.customerWorkspaceEmail, password: fixtureRefs.customerWorkspacePassword },
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    expect(operatorLogin.ok()).toBeTruthy();
    expect(supportLogin.ok()).toBeTruthy();
    expect(technicianLogin.ok()).toBeTruthy();
    expect(customerLogin.ok()).toBeTruthy();

    const operatorToken = String((await operatorLogin.json())?.token || "");
    const supportToken = String((await supportLogin.json())?.token || "");
    const technicianToken = String((await technicianLogin.json())?.token || "");
    const customerToken = String((await customerLogin.json())?.token || "");

    const [operatorMap, supportMap, technicianMap, customerMap] = await Promise.all([
      requestLocalApi(request, "/integrations/orchestration-map", {
        headers: { Authorization: `Bearer ${operatorToken}` },
      }),
      requestLocalApi(request, "/integrations/orchestration-map", {
        headers: { Authorization: `Bearer ${supportToken}` },
      }),
      requestLocalApi(request, "/integrations/orchestration-map", {
        headers: { Authorization: `Bearer ${technicianToken}` },
      }),
      requestLocalApi(request, "/integrations/orchestration-map", {
        headers: { Authorization: `Bearer ${customerToken}` },
      }),
    ]);

    expect(operatorMap.ok()).toBeTruthy();
    expect(supportMap.ok()).toBeTruthy();
    expect(technicianMap.status()).toBe(403);
    expect([401, 403]).toContain(customerMap.status());

    const operatorPayload = await operatorMap.json();
    const supportPayload = await supportMap.json();
    const serialized = JSON.stringify({ operatorPayload, supportPayload });
    expect(serialized).not.toContain("qbo_e2e_webhook_secret");
    expect(serialized).not.toContain("google_e2e_personal_refresh");
    expect(serialized).not.toContain("support_webhook_secret");

    const quickbooksRow = Array.isArray(operatorPayload?.providers)
      ? operatorPayload.providers.find((row: any) => row.provider === "quickbooks")
      : null;
    const webhookRow = Array.isArray(supportPayload?.providers)
      ? supportPayload.providers.find((row: any) => row.provider === "generic-webhook")
      : null;
    expect(["Connected", "Needs attention"]).toContain(quickbooksRow?.healthLabel);
    expect(typeof quickbooksRow?.automationReadiness?.safeToAutomate).toBe("boolean");
    if (quickbooksRow?.healthLabel === "Needs attention") {
      expect([null, "invalid_signature", "setup_required"]).toContain(quickbooksRow?.diagnostics?.lastErrorCategory ?? null);
    }
    expect(webhookRow?.automationReadiness?.safeToAutomate).toBe(false);
  });

  test("orchestration actions stay safe and dry-run webhook tests do not fake readiness", async ({ request }) => {
    const operatorLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: "e2e.operator@mytitan.local", password: "MyTitanE2E!2026" },
      headers: { "Content-Type": "application/json" },
    });
    const supportLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.supportOwnerEmail, password: fixtureRefs.supportOwnerPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(operatorLogin.ok()).toBeTruthy();
    expect(supportLogin.ok()).toBeTruthy();
    const operatorToken = String((await operatorLogin.json())?.token || "");
    const supportToken = String((await supportLogin.json())?.token || "");

    const dryRun = await requestLocalApi(request, "/integrations/orchestration/quickbooks/test-webhook?scope=workspace", {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    expect(dryRun.ok()).toBeTruthy();
    const dryRunJson = await dryRun.json();
    expect(dryRunJson).toMatchObject({ mode: "dry_run" });
    expect(typeof dryRunJson.ok).toBe("boolean");
    expect(typeof dryRunJson.routeReady).toBe("boolean");
    if (dryRunJson.routeReady) {
      expect(dryRunJson.ok).toBe(true);
    } else {
      expect(dryRunJson.ok).toBe(false);
    }

    const invalidSupport = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/webhooks/generic-webhook/e2esupportroute001`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-provider-signature": "bad_signature",
      },
      data: JSON.stringify({ id: "evt_invalid_support", type: "integration.test" }),
      failOnStatusCode: false,
    });
    expect([403, 503]).toContain(invalidSupport.status());

    const supportMap = await requestLocalApi(request, "/integrations/orchestration-map", {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    expect(supportMap.ok()).toBeTruthy();
    const supportPayload = await supportMap.json();
    const webhookRow = Array.isArray(supportPayload?.providers)
      ? supportPayload.providers.find((row: any) => row.provider === "generic-webhook")
      : null;
    expect(webhookRow?.automationReadiness?.safeToAutomate).toBe(false);
    expect(webhookRow?.automationReadiness?.webhookVerified).toBe(false);
  });

  test("tenant-owned webhook routing validates signatures and deduplicates event ids", async ({ request }) => {
    const payload = JSON.stringify({ id: "evt_e2e_qbo_001", type: "invoice.updated" });
    const validSignature = "050d19e4959c028a60d4bd8831dce01f616316e1ccf71db7c7595de1d959846d";
    const invalidSignature = "bad_signature";

    const invalid = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/webhooks/quickbooks/e2eqbohookroute001`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-provider-signature": invalidSignature,
      },
      data: payload,
      failOnStatusCode: false,
    });
    expect([403, 503]).toContain(invalid.status());

    const accepted = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/webhooks/quickbooks/e2eqbohookroute001`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-provider-signature": validSignature,
      },
      data: payload,
      failOnStatusCode: false,
    });
    if (invalid.status() === 503) {
      expect(accepted.status()).toBe(503);
      return;
    }
    expect(accepted.status()).toBe(202);
    expect(await accepted.json()).toMatchObject({ received: true });

    const duplicate = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/webhooks/quickbooks/e2eqbohookroute001`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-provider-signature": validSignature,
      },
      data: payload,
      failOnStatusCode: false,
    });
    expect(duplicate.status()).toBe(202);
    expect(await duplicate.json()).toMatchObject({ received: true, duplicate: true });

    const unknown = await request.fetch(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/integrations/webhooks/quickbooks/not-a-real-route`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-provider-signature": validSignature,
      },
      data: payload,
      failOnStatusCode: false,
    });
    expect(unknown.status()).toBe(404);
  });

  test("connected tools UI never exposes seeded raw secrets and technicians cannot manage admin integration settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/integrations");

    await expect(page.locator("body")).not.toContainText("qbo_e2e_webhook_secret");
    await expect(page.locator("body")).not.toContainText("support_webhook_secret");
    await expect(page.locator("body")).not.toContainText("google_e2e_personal_refresh");

    const technicianLogin = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
      data: { email: fixtureRefs.technicianEmail, password: fixtureRefs.technicianPassword },
      headers: { "Content-Type": "application/json" },
    });
    expect(technicianLogin.ok()).toBeTruthy();
    const technicianToken = String((await technicianLogin.json())?.token || "");

    const forbiddenSave = await requestLocalApi(request, "/integrations/byog/quickbooks", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${technicianToken}`,
        "Content-Type": "application/json",
      },
      data: {
        displayName: "Technician should not save this",
        scope: "workspace",
        metadata: { accountLabel: "Nope" },
      },
    });
    expect(forbiddenSave.status()).toBe(403);
  });
});
