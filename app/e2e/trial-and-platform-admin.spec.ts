import crypto from "crypto";
import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { cleanupGeneratedWorkspace, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

function readRootEnvValue(name: string) {
  try {
    const envPath = path.join(__dirname, "..", "..", ".env");
    const raw = fs.readFileSync(envPath, "utf8");
    const line = raw
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`));
    if (!line) return "";
    const value = line.slice(name.length + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  } catch {
    return "";
  }
}

function buildStableTrackedNotificationId(companyId: string, seed: string) {
  const digest = crypto.createHash("sha256").update(`${companyId}:${seed}`).digest("hex");
  return `trk_${digest.slice(0, 28)}`;
}

function buildTrackedClickId(notificationId: string, expiresAt: Date) {
  const secret =
    process.env.EMAIL_TRACKING_SECRET ||
    process.env.JWT_SECRET ||
    readRootEnvValue("EMAIL_TRACKING_SECRET") ||
    readRootEnvValue("JWT_SECRET") ||
    "dev_insecure_click_tracking";
  const payload = Buffer.from(
    JSON.stringify({
      n: notificationId,
      e: expiresAt.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.describe("trial model and platform admin separation", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("new customer account gets a 14-day trial", async ({ request }) => {
    const email = `trial-${Date.now()}@example.test`;
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Trial Workspace ${Date.now()}`,
        email,
        password: "MyTitanTrial!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();
    expect(signupJson?.user?.platformAdmin).toBeFalsy();

    const billingResponse = await request.get("http://127.0.0.1:3000/billing/me", {
      headers: { Authorization: `Bearer ${signupJson.token}` },
    });
    expect(billingResponse.ok()).toBeTruthy();
    const billingJson = await billingResponse.json();
    expect(billingJson?.subscription?.status).toBe("trialing");
    expect(billingJson?.trial?.isActive).toBe(true);
    expect(Number(billingJson?.trial?.daysRemaining || 0)).toBeGreaterThanOrEqual(13);
    expect(Number(billingJson?.trial?.daysRemaining || 0)).toBeLessThanOrEqual(14);

    await cleanupGeneratedWorkspace(request, signupJson.token);
  });

  test("trial lifecycle emails stay idempotent across the main trial stages", async ({ request }) => {
    const uniqueId = Date.now();
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Lifecycle Workspace ${uniqueId}`,
        email: `lifecycle-${uniqueId}@example.test`,
        password: "MyTitanTrial!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();
    const tenantId = String(signupJson?.company?.id || "");
    expect(tenantId).toBeTruthy();

    const ownerHeaders = { Authorization: `Bearer ${signupJson.token}` };
    const platformLogin = await request.post("http://127.0.0.1:3000/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: {
        email: fixtureRefs.platformAdminEmail,
        password: fixtureRefs.platformAdminPassword,
      },
    });
    expect(platformLogin.ok()).toBeTruthy();
    const platformJson = await platformLogin.json();
    const platformHeaders = {
      Authorization: `Bearer ${platformJson.token}`,
      "Content-Type": "application/json",
    };

    async function triggerTrialCheck() {
      const response = await request.get("http://127.0.0.1:3000/billing/me", { headers: ownerHeaders });
      expect(response.ok()).toBeTruthy();
      return response.json();
    }

    async function listTrialLifecycleAudit() {
      const response = await request.get("http://127.0.0.1:3000/audit?type=notification.trial_lifecycle.dispatch&pageSize=100", {
        headers: ownerHeaders,
      });
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      return Array.isArray(body?.items) ? body.items : [];
    }

    async function patchTrial(startedAt: Date, endsAt: Date) {
      const response = await request.patch(`http://127.0.0.1:3000/admin/platform/tenants/${tenantId}/trial`, {
        headers: platformHeaders,
        data: {
          startedAt: startedAt.toISOString(),
          endsAt: endsAt.toISOString(),
          confirmation: true,
          reason: "E2E lifecycle trial adjustment",
        },
      });
      expect(response.ok()).toBeTruthy();
    }

    try {
      await triggerTrialCheck();
      const welcomeAudit = await listTrialLifecycleAudit();
      expect(welcomeAudit.filter((entry: any) => String(entry?.message || "").includes("trial_started")).length).toBe(1);

      await triggerTrialCheck();
      expect((await listTrialLifecycleAudit()).filter((entry: any) => String(entry?.message || "").includes("trial_started")).length).toBe(1);

      const now = Date.now();
      await patchTrial(new Date(now - 11 * 24 * 60 * 60 * 1000), new Date(now + 3 * 24 * 60 * 60 * 1000));
      await triggerTrialCheck();
      expect((await listTrialLifecycleAudit()).filter((entry: any) => String(entry?.message || "").includes("trial_ending_soon")).length).toBe(1);

      await triggerTrialCheck();
      expect((await listTrialLifecycleAudit()).filter((entry: any) => String(entry?.message || "").includes("trial_ending_soon")).length).toBe(1);

      await patchTrial(new Date(now - 13 * 24 * 60 * 60 * 1000), new Date(now + 1 * 24 * 60 * 60 * 1000));
      await triggerTrialCheck();
      expect((await listTrialLifecycleAudit()).filter((entry: any) => String(entry?.message || "").includes("trial_final_reminder")).length).toBe(1);

      await patchTrial(new Date(now - 15 * 24 * 60 * 60 * 1000), new Date(now - 1 * 60 * 60 * 1000));
      await triggerTrialCheck();
      expect((await listTrialLifecycleAudit()).filter((entry: any) => String(entry?.message || "").includes("trial_expired")).length).toBe(1);
    } finally {
      await cleanupGeneratedWorkspace(request, signupJson.token);
    }
  });

  test("tracked lifecycle links redirect safely through the click tracker", async ({ request }) => {
    const uniqueId = Date.now();
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Tracked Lifecycle Workspace ${uniqueId}`,
        email: `tracked-lifecycle-${uniqueId}@example.test`,
        password: "MyTitanTrial!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();
    const tenantId = String(signupJson?.company?.id || "");
    expect(tenantId).toBeTruthy();

    const ownerHeaders = { Authorization: `Bearer ${signupJson.token}` };
    const platformLogin = await request.post("http://127.0.0.1:3000/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: {
        email: fixtureRefs.platformAdminEmail,
        password: fixtureRefs.platformAdminPassword,
      },
    });
    expect(platformLogin.ok()).toBeTruthy();
    const platformJson = await platformLogin.json();
    const platformHeaders = {
      Authorization: `Bearer ${platformJson.token}`,
      "Content-Type": "application/json",
    };

    const now = Date.now();
    const startedAt = new Date(now - 11 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(now + 3 * 24 * 60 * 60 * 1000);
    const lifecycleKey = `trial_lifecycle:ending_soon:${endsAt.toISOString()}`;
    const notificationId = buildStableTrackedNotificationId(tenantId, lifecycleKey);
    try {
      const patchResponse = await request.patch(`http://127.0.0.1:3000/admin/platform/tenants/${tenantId}/trial`, {
        headers: platformHeaders,
        data: {
          startedAt: startedAt.toISOString(),
          endsAt: endsAt.toISOString(),
          confirmation: true,
          reason: "E2E tracked lifecycle trial adjustment",
        },
      });
      expect(patchResponse.ok()).toBeTruthy();

      const triggerResponse = await request.get("http://127.0.0.1:3000/billing/me", {
        headers: ownerHeaders,
      });
      expect(triggerResponse.ok()).toBeTruthy();

      const trackedId = buildTrackedClickId(notificationId, new Date(endsAt.getTime() + 7 * 24 * 60 * 60 * 1000));
      const clickResponse = await request.get(`http://127.0.0.1:3000/t/c/${encodeURIComponent(trackedId)}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      expect([301, 302, 303, 307, 308]).toContain(clickResponse.status());
      const location = clickResponse.headers()["location"] || "";
      expect(location).toContain("/dashboard/billing");
      expect(location).not.toContain("token=");
      expect(location).not.toContain(".local");
      expect(location).not.toContain("localhost");
    } finally {
      await cleanupGeneratedWorkspace(request, signupJson.token);
    }
  });

  test("public signup rejects clearly generated artifact identities on the live host", async ({ request }) => {
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-host": "api.mytitan.co.uk",
      },
      data: {
        companyName: `Trial Workspace ${Date.now()}`,
        email: `verify-${Date.now()}@mytitan.local`,
        password: "MyTitanTrial!2026",
      },
    });
    expect(signupResponse.status()).toBe(400);
    const signupJson = await signupResponse.json();
    expect(signupJson).toMatchObject({
      message: "Use a real company name and email address on the live signup form.",
    });
  });

  test("support@mytitan.co.uk does not get trial treatment", async ({ request }) => {
    const credentials = {
      email: "support@mytitan.co.uk",
      password: "MyTitanSupport!2026",
    };
    const loginResponse = await request.post("http://127.0.0.1:3000/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: credentials,
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginJson = await loginResponse.json();
    expect(loginJson?.user?.platformAdmin).toBe(true);

    const billingResponse = await request.get("http://127.0.0.1:3000/billing/me", {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    expect(billingResponse.ok()).toBeTruthy();
    const billingJson = await billingResponse.json();
    expect(billingJson?.trial?.isActive).toBe(false);
    expect(billingJson?.trial?.status).toBe("not_applicable");
  });

  test("customer users cannot access platform-admin controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);

    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-admin-forbidden")).toBeVisible();
    expect(token).toBeTruthy();
    const platformLookup = await request.get("http://127.0.0.1:3000/admin/platform/tenants?q=e2e", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(platformLookup.status()).toBe(403);
    const membershipsResponse = await request.get("http://127.0.0.1:3000/admin/platform/memberships", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(membershipsResponse.status()).toBe(403);
    const overviewResponse = await request.get("http://127.0.0.1:3000/admin/platform/overview", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(overviewResponse.status()).toBe(403);
    const revenueResponse = await request.get("http://127.0.0.1:3000/admin/platform/revenue", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revenueResponse.status()).toBe(403);
    const templatesResponse = await request.get("http://127.0.0.1:3000/admin/platform/templates", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(templatesResponse.status()).toBe(403);
    const billingCatalogResponse = await request.get("http://127.0.0.1:3000/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(billingCatalogResponse.status()).toBe(403);
    const billingCatalogRevealResponse = await request.get("http://127.0.0.1:3000/admin/platform/billing-catalog/job_pack%3Ajob_completion_pack_3%3Anone/reveal", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(billingCatalogRevealResponse.status()).toBe(403);
    const errorLogsResponse = await request.get("http://127.0.0.1:3000/admin/platform/error-logs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(errorLogsResponse.status()).toBe(403);
    const emailControlResponse = await request.get("http://127.0.0.1:3000/admin/platform/email-control", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(emailControlResponse.status()).toBe(403);
  });

  test("workspace owner still cannot access the platform product catalog", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    expect(token).toBeTruthy();

    const billingCatalogResponse = await request.get("http://127.0.0.1:3000/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(billingCatalogResponse.status()).toBe(403);
  });

  test("platform revenue reports actual zero when tenants have no real MyTitan payments", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    expect(token).toBeTruthy();

    const revenueResponse = await request.get("http://127.0.0.1:3000/admin/platform/revenue", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revenueResponse.ok()).toBeTruthy();
    const revenueJson = await revenueResponse.json();
    const actualMrr = revenueJson?.totals?.actualMonthlyRecurringRevenueByCurrency || [];
    const actualArr = revenueJson?.totals?.actualAnnualRecurringRevenueByCurrency || [];
    const actualJobPacks = revenueJson?.totals?.actualJobPackRevenueByCurrency || [];

    for (const currency of ["GBP", "USD"]) {
      expect(actualMrr.find((row: any) => row.currency === currency)?.amountCents).toBe(0);
      expect(actualArr.find((row: any) => row.currency === currency)?.amountCents).toBe(0);
      expect(actualJobPacks.find((row: any) => row.currency === currency)?.amountCents).toBe(0);
    }
    expect(revenueJson?.totals?.activePaidWorkspaces).toBe(0);
    expect(revenueJson?.totals?.revenueSourceLabels).toContain("Actual revenue");
    expect(revenueJson?.totals?.revenueSourceLabels).toContain("Forecast");
    expect(revenueJson?.totals?.revenueSourceLabels).toContain("Tenant customer payments excluded");
    expect(revenueJson?.movement?.forecastBasis).toContain("excludes tenant customer payments");

    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-revenue-mrr")).toContainText("Actual MRR");
    await expect(page.getByTestId("platform-revenue-mrr")).toContainText("£0.00");
    await expect(page.getByTestId("platform-revenue-mrr")).toContainText(/\$0\.00|US\$0\.00/);
    await expect(page.getByTestId("platform-revenue-arr")).toContainText("Actual ARR");
    await expect(page.getByTestId("platform-revenue-job-packs")).toContainText("Actual job-pack revenue");
    await expect(page.getByTestId("platform-revenue-forecast")).toContainText("Forecast");
  });

  test("platform-admin billing catalog accepts human GBP prices and keeps identifiers masked", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    expect(token).toBeTruthy();

    const validate19 = await request.post("http://127.0.0.1:3000/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        kind: "subscription_price",
        code: "SOLE_TRADER",
        interval: "MONTHLY",
        expectedAmount: "£19.00",
        currency: "GBP",
        mode: "validate",
      },
    });
    expect(validate19.ok()).toBeTruthy();
    const validate19Json = await validate19.json();
    expect(validate19Json.item.expectedAmountCents).toBe(1900);
    expect(validate19Json.item.expectedAmountDisplay).toBe("£19.00");

    const save1250 = await request.post("http://127.0.0.1:3000/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        kind: "job_pack",
        code: "job_completion_pack_2",
        expectedAmount: "12.50",
        currency: "GBP",
        changeNotes: "E2E confirms human GBP price entry stores minor units.",
      },
    });
    expect(save1250.ok()).toBeTruthy();
    const save1250Json = await save1250.json();
    expect(save1250Json.item.expectedAmountCents).toBe(1250);
    expect(save1250Json.item.expectedAmountDisplay).toBe("£12.50");
    expect(JSON.stringify(save1250Json)).not.toContain("price_e2e_job_pack_25");

    const invalid = await request.post("http://127.0.0.1:3000/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        kind: "job_pack",
        code: "job_completion_pack_2",
        expectedAmount: "12.505",
        currency: "GBP",
        mode: "validate",
      },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.text()).toContain("£19.00");
  });

  test("website visits are recorded without raw public tokens", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    expect(token).toBeTruthy();

    const record = await request.post("http://127.0.0.1:3000/analytics/traffic", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        path: "/portal/booking/status/super-secret-token?session_id=cs_secret_123",
        surface: "public_status",
        sessionId: "e2e-session",
      },
    });
    expect(record.ok()).toBeTruthy();

    const summary = await request.get("http://127.0.0.1:3000/analytics/traffic/summary", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(summary.ok()).toBeTruthy();
    const summaryText = await summary.text();
    expect(summaryText).toContain("/portal/booking/status/[token]");
    expect(summaryText).not.toContain("super-secret-token");
    expect(summaryText).not.toContain("cs_secret_123");
  });

  test("platform-admin can access internal controls from the separate platform surface", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await request.delete("http://127.0.0.1:3000/admin/platform/tenants/e2e-company/support-mode", {
      headers: { Authorization: `Bearer ${token}` },
    });

    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-admin-overview")).toBeVisible();
    await expect(page.getByTestId("platform-support-operations")).toBeVisible();
    await expect(page.getByTestId("platform-revenue-dashboard")).toBeVisible();
    await expect(page.getByTestId("platform-system-monitoring")).toBeVisible();
    await expect(page.getByTestId("platform-uptime-availability-card")).toContainText(/Internal platform health|Healthy|Degraded|Attention needed|Down/i);
    await expect(page.getByTestId("platform-website-visits-card")).toBeVisible();
    await expect(page.getByTestId("platform-public-reachability-card")).toBeVisible();
    await expect(page.getByTestId("platform-email-health-card")).toBeVisible();
    await expect(page.getByTestId("platform-billing-sync-card")).toBeVisible();
    await expect(page.getByTestId("platform-template-review")).toBeVisible();
    await expect(page.getByTestId("platform-deferred-capability-register")).toContainText("Deferred capability register");
    await expect(page.getByTestId("platform-deferred-capability-register")).toContainText("External uptime monitoring");
    await expect(page.getByTestId("platform-deferred-capability-register")).toContainText("DVLA and MOT lookup");
    await expect(page.getByTestId("platform-deferred-capability-register")).toContainText("Legal wording approval");
    await expect(page.getByTestId("platform-template-preview-panel")).toBeVisible();
    await expect(page.getByTestId("platform-template-history")).toBeVisible();
    await expect(page.getByTestId("platform-billing-catalog-admin")).toBeVisible();
    await expect(page.getByTestId("platform-email-control-admin")).toBeVisible();
    await expect(page.getByTestId("platform-membership-dashboard")).toBeVisible();
    await expect(page.getByTestId("platform-chart-tenant-lifecycle")).toBeVisible();
    await expect(page.getByTestId("platform-chart-plan-distribution")).toBeVisible();
    await expect(page.getByTestId("platform-tenant-attention-list")).toBeVisible();
    await expect(page.getByTestId("platform-stripe-alignment")).toContainText(/Server billing key|configured|missing/i);
    await expect(page.getByText("Growth trend")).toBeVisible();
    await expect(page.getByText("Current pressure")).toBeVisible();
    await expect(page.getByTestId("platform-admin-overview")).toContainText("Actual revenue");
    await page.getByTestId("platform-memberships-search").fill("E2E MyTitan Workspace");
    await expect(page.getByTestId("platform-memberships-table").first()).toContainText("E2E MyTitan Workspace");
    await page.getByTestId("platform-tenant-search-input").fill("E2E MyTitan Workspace");
    await page.getByTestId("platform-tenant-search-submit").click();
    await page.getByTestId("platform-tenant-result-e2e-company").click();
    await page.getByTestId("platform-support-mode-reason").fill("E2E platform operations investigation");
    await page.getByTestId("platform-support-mode-start").click();

    await expect(page.getByTestId("platform-pricing-controls")).toBeVisible();
    await expect(page.getByTestId("platform-trial-controls")).toBeVisible();
    await expect(page.getByTestId("platform-tenant-email-readiness")).toBeVisible();
    await expect(page.getByTestId("platform-tenant-next-action")).toBeVisible();
    await expect(page.getByTestId("platform-tenant-detail")).toContainText("E2E MyTitan Workspace");
    await expect(page.locator('[data-testid^="platform-billing-catalog-history-"]').first()).toBeVisible();

    const catalogRow = page.getByTestId("platform-billing-catalog-item-job_completion_pack_3-none");
    await expect(catalogRow).toBeVisible();
    await expect(catalogRow.getByTestId("platform-billing-catalog-amount-job_completion_pack_3-none")).toHaveValue(/£25\.00|25\.00/);
    await expect(catalogRow).toContainText("Expected price: £25.00");
    await expect(catalogRow).toContainText(/Price ID:\s*price_.*••••/);
    await expect(catalogRow).toContainText(/Product ID:\s*prod_.*••••/);
    await page.getByTestId("platform-billing-catalog-reveal-job_completion_pack_3-none").click();
    await expect(catalogRow).toContainText(/Price ID:\s*price_[A-Za-z0-9_]{8,}/);
    await expect(catalogRow).toContainText(/Product ID:\s*prod_[A-Za-z0-9_]{8,}/);
    await expect(catalogRow).not.toContainText(/sk_(live|test)_|whsec_/);

    await expect(page.getByTestId("platform-email-mode")).toContainText(
      /production|e2e|test|development|staging/i,
    );
    await expect(page.getByTestId("platform-email-pause")).toBeVisible();
    await expect(page.getByTestId("platform-email-resume")).toBeVisible();

    await page.goto("/dashboard/settings/operations", { waitUntil: "networkidle" });
    await expect(page.getByTestId("internal-monitoring-overview")).toBeVisible();
  });

  test("platform-admin can pause and resume outbound email safely", async ({ request }) => {
    const loginResponse = await request.post("http://127.0.0.1:3000/auth/login", {
      headers: { "Content-Type": "application/json" },
      data: {
        email: fixtureRefs.platformAdminEmail,
        password: fixtureRefs.platformAdminPassword,
      },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginJson = await loginResponse.json();
    const headers = {
      Authorization: `Bearer ${loginJson.token}`,
      "Content-Type": "application/json",
    };

    const before = await request.get("http://127.0.0.1:3000/admin/platform/email-control", { headers });
    expect(before.ok()).toBeTruthy();

    const pauseResponse = await request.patch("http://127.0.0.1:3000/admin/platform/email-control", {
      headers,
      data: { action: "pause", reason: "E2E pause verification" },
    });
    expect(pauseResponse.ok()).toBeTruthy();
    expect((await pauseResponse.json())?.paused).toBe(true);

    const pausedState = await request.get("http://127.0.0.1:3000/admin/platform/email-control", { headers });
    expect(pausedState.ok()).toBeTruthy();
    const pausedJson = await pausedState.json();
    expect(pausedJson?.control?.paused).toBe(true);
    expect(String(pausedJson?.control?.pausedReason || "")).toContain("E2E pause verification");

    const resumeResponse = await request.patch("http://127.0.0.1:3000/admin/platform/email-control", {
      headers,
      data: { action: "resume" },
    });
    expect(resumeResponse.ok()).toBeTruthy();
    expect((await resumeResponse.json())?.paused).toBe(false);
  });

  test("platform-admin can review and clear safe error logs without deleting protected entries", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    await page.goto("/platform?section=error-logs", { waitUntil: "networkidle" });

    const validationLog = page.getByTestId("platform-safe-error-log-e2e-safe-log-validation-open");
    const reviewedLog = page.getByTestId("platform-safe-error-log-e2e-safe-log-billing-reviewed");
    const protectedLog = page.getByTestId("platform-safe-error-log-e2e-safe-log-webhook-protected");
    await expect(validationLog).toBeVisible();
    await expect(reviewedLog).toBeVisible();
    await expect(protectedLog).toBeVisible();

    const reviewProtected = page.getByTestId("platform-safe-error-log-review-e2e-safe-log-webhook-protected");
    await reviewProtected.scrollIntoViewIfNeeded();
    await reviewProtected.click();
    await expect(protectedLog).toContainText(/reviewed/i);

    const clearValidation = page.getByTestId("platform-safe-error-log-clear-validation");
    await clearValidation.scrollIntoViewIfNeeded();
    await clearValidation.click();
    await expect(validationLog).toHaveCount(0);
    await expect(protectedLog).toBeVisible();

    const clearReviewed = page.getByTestId("platform-safe-error-log-clear-reviewed");
    await clearReviewed.scrollIntoViewIfNeeded();
    await clearReviewed.click();
    await expect(reviewedLog).toHaveCount(0);
    await expect(protectedLog).toBeVisible();
  });

  test("platform-admin dashboard remains usable on a narrow mobile viewport", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-admin-overview")).toBeVisible();
    await expect(page.getByTestId("platform-admin-overview")).toContainText("Actual revenue");
    await expect(page.getByTestId("platform-chart-tenant-lifecycle")).toBeVisible();
    await expect(page.getByTestId("platform-support-operations")).toBeVisible();
    await expect(page.getByTestId("platform-tenant-search-input")).toBeVisible();
  });

  test("tenant billing page shows trial state without internal platform controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/billing", { waitUntil: "networkidle" });
    await expect(page.getByTestId("billing-trial-card")).toBeVisible();
    await expect(page.getByTestId("billing-trial-status")).toContainText(/trial active/i);
    await expect(page.getByTestId("billing-trial-days")).toContainText(/remaining/i);
    await expect(page.getByTestId("billing-trial-guidance")).toContainText(/upgrade before the trial ends/i);
    await expect(page.getByText(/keep the workspace and billing flow running without interruption/i)).toBeVisible();
    await expect(page.getByTestId("billing-custom-pricing")).toHaveCount(0);
    await expect(page.getByText("Internal only", { exact: true })).toHaveCount(0);
    await expect(page.getByText("AI usage", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("billing-platform-catalog-link")).toHaveCount(0);
  });

  test("platform admin sees platform-only billing deep links into the catalog", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    await page.goto("/dashboard/billing?section=job-packs", { waitUntil: "networkidle" });
    await expect(page.getByTestId("billing-platform-catalog-link")).toBeVisible();
    await page.getByTestId("billing-platform-catalog-link-job_completion_pack_1-none").click();
    await page.waitForURL(/\/platform\?section=billing-catalog&product=/);
    await expect(page.getByTestId("platform-billing-catalog-item-job_completion_pack_1-none")).toBeVisible();
  });

  test("unverified owner sees resend verification guidance on billing without weakening the blocker", async ({ page, request }) => {
    await installApiProxy(page, request);
    const email = `billing-unverified-${Date.now()}@example.test`;
    const signupResponse = await request.post("http://127.0.0.1:3000/auth/signup", {
      headers: { "Content-Type": "application/json" },
      data: {
        companyName: `Billing Verify Workspace ${Date.now()}`,
        email,
        password: "MyTitanTrial!2026",
      },
    });
    expect(signupResponse.ok()).toBeTruthy();
    const signupJson = await signupResponse.json();

    try {
      await page.addInitScript((token) => {
        window.localStorage.setItem("mytitan_token", token);
      }, signupJson.token);

      await page.goto("/dashboard/billing", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: /mytitan account/i })).toBeVisible();
      await expect(page.getByText(/verify your email to continue/i).first()).toBeVisible();
      await expect(page.getByText(/resend the mytitan verification email/i).first()).toBeVisible();
      await expect(page.getByText(/workspace cannot send verification emails yet|finish outbound email setup/i)).toHaveCount(0);
      await expect(page.getByTestId("billing-resend-verification")).toBeVisible();
      await page.getByTestId("billing-resend-verification").click();
      await expect(
        page.getByText(/verification email sent from mytitan|mytitan email is not set up yet|mytitan cannot send verification emails right now|this address cannot receive live verification email/i).first(),
      ).toBeVisible();
      await expect(page.locator('[data-testid^="billing-choose-plan-"]').first()).toContainText(/verify email to continue/i);
    } finally {
      await cleanupGeneratedWorkspace(request, signupJson.token);
    }
  });
});
