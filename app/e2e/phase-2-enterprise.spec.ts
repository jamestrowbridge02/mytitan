import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

function expectNoSecrets(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain("access_token");
  expect(serialized).not.toContain("refresh_token");
  expect(serialized).not.toContain("client_secret");
  expect(serialized).not.toContain("smtp://");
  expect(serialized).not.toContain("sk_live_");
  expect(serialized).not.toContain("sk_test_");
  expect(serialized).not.toContain("whsec_");
}

test.describe("Phase 2 category-leader foundations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("overview exposes truthful enterprise readiness without live provider mutation", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const response = await requestLocalApi(request, "/enterprise/phase-2/overview", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.stage).toBe("phase_2_category_leader_readiness");
    expect(body.truthContract.stripeMutation).toBe(false);
    expect(body.truthContract.liveExternalMutationWithoutExplicitConfig).toBe(false);
    expect(body.truthContract.secretsReturnedToClient).toBe(false);
    expect(body.truthContract.fakeAiOrReporting).toBe(false);
    expect(body.truthContract.tenantIsolation).toBe(true);
    expectNoSecrets(body);

    const providers = body.integrations.providers.map((provider: any) => provider.provider);
    expect(providers).toEqual(expect.arrayContaining(["xero", "quickbooks", "google_calendar", "microsoft_calendar", "apple_ical", "gmail", "outlook"]));
    const xero = body.integrations.providers.find((provider: any) => provider.provider === "xero");
    const quickbooks = body.integrations.providers.find((provider: any) => provider.provider === "quickbooks");
    expect(xero.liveEnabled).toBe(false);
    expect(quickbooks.liveEnabled).toBe(false);
    expect(xero.capabilityState).toMatch(/setup_needed|dry_run_ready|live_gated_ready/);
    expect(xero.dryRunValidation.submitsLiveData).toBe(false);
    expect(xero.auditTrail.events).toEqual(expect.arrayContaining(["connect", "reconnect", "disconnect", "dry_run", "live_sync_attempt"]));
    expect(xero.tokensReturnedToClient).toBe(false);
    expect(quickbooks.tokensReturnedToClient).toBe(false);
  });

  test("offline field service and technician mobile stay scoped and token-free", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    const offline = await requestLocalApi(request, "/enterprise/phase-2/offline-field", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(offline.ok()).toBeTruthy();
    const offlineBody = await offline.json();
    expect(offlineBody.fullAuthenticatedAppCaching).toBe(false);
    expect(offlineBody.storesSecretsOrTokens).toBe(false);
    expect(offlineBody.packetScope).toBe("assigned_jobs_only");
    expect(offlineBody.packetDownload.excludes).toEqual(expect.arrayContaining(["secrets", "oauth_tokens", "unassigned_jobs", "full_authenticated_app_cache"]));
    expect(offlineBody.supportedActions).toEqual(expect.arrayContaining(["view_assigned_jobs", "complete_job", "capture_photos", "capture_signature", "record_materials", "record_payment_notes", "sync_on_reconnect"]));
    expect(offlineBody.queues.map((item: any) => item.key)).toEqual(expect.arrayContaining(["before_photos", "after_photos", "signature", "materials", "payment_note"]));
    expect(offlineBody.queueControls).toEqual(expect.arrayContaining(["clear_failed_item", "retry_failed_item", "retry_all", "review_conflict"]));
    expect(offlineBody.syncStates).toEqual(expect.arrayContaining(["saved_offline", "queued", "syncing", "conflict", "uploaded", "synced"]));
    expectNoSecrets(offlineBody);

    const mobile = await requestLocalApi(request, "/enterprise/phase-2/technician-mobile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mobile.ok()).toBeTruthy();
    const mobileBody = await mobile.json();
    expect(mobileBody.home).toBe("My Day");
    expect(mobileBody.primaryActions).toEqual(expect.arrayContaining(["My Day", "Next Job", "Get Directions", "Start Work", "Add Before Photos", "Complete Job", "Add After Photos", "Capture Signature", "Record Materials", "Sync Status"]));
    expect(mobileBody.hiddenNoise).toEqual(expect.arrayContaining(["admin_accounting_setup", "platform_diagnostics", "billing_catalog"]));
  });

  test("report builder and AI readiness use evidence and remain optional", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const reports = await requestLocalApi(request, "/enterprise/phase-2/reports", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reports.ok()).toBeTruthy();
    const reportBody = await reports.json();
    expect(reportBody.realDataOnly).toBe(true);
    expect(reportBody.fakeForecasting).toBe(false);
    expect(reportBody.savedReportsSupported).toBe(true);
    expect(reportBody.savedTemplates).toEqual(expect.arrayContaining(["profit_by_service", "profit_by_location", "profit_by_technician", "utilisation", "repeat_booking_rate", "customer_lifetime_value", "unpaid_invoices", "low_stock", "completion_velocity", "payment_collection_time"]));
    expect(reportBody.roleScopedAccess).toBe(true);
    expect(reportBody.metrics.unpaidInvoices.count).toBeGreaterThanOrEqual(0);
    expect(reportBody.metrics.lowStock.count).toBeGreaterThanOrEqual(0);

    const overview = await requestLocalApi(request, "/enterprise/phase-2/overview", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const overviewBody = await overview.json();
    expect(overviewBody.accountingPreLaunch.liveSubmissionEnabled).toBe(false);
    expect(overviewBody.accountingPreLaunch.invoiceExportPreview.count).toBeGreaterThanOrEqual(0);
    expect(overviewBody.accountingPreLaunch.paymentExportPreview.count).toBeGreaterThanOrEqual(0);
    expect(overviewBody.accountingPreLaunch.vatTaxCodeMappingPreview.overwritesLedger).toBe(false);
    expect(overviewBody.accountingPreLaunch.queues.failedSyncRetry.status).toBe("ready_with_backoff");

    const csv = await requestLocalApi(request, "/enterprise/phase-2/reports/summary.csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(csv.ok()).toBeTruthy();
    const csvText = await csv.text();
    expect(csvText).toContain("real_data_only");
    expect(csvText).not.toContain("sk_live_");

    const ai = await requestLocalApi(request, "/enterprise/phase-2/ai-readiness", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ai.ok()).toBeTruthy();
    const aiBody = await ai.json();
    expect(aiBody.modelCallsEnabled).toBe(false);
    expect(aiBody.autonomousChanges).toBe(false);
    expect(aiBody.recommendations.map((item: any) => item.key)).toEqual(expect.arrayContaining(["scheduling_suggestions", "technician_match", "missing_photo_warning", "incomplete_paperwork", "overdue_invoice_risk", "rebooking_opportunity"]));
    for (const item of aiBody.recommendations) {
      expect(item.evidenceCount).toBeGreaterThanOrEqual(0);
      expect(String(item.action || "")).toBeTruthy();
    }
  });

  test("multi-location, white-label, growth, and accreditation are tenant-scoped readiness contracts", async ({ request }) => {
    const ownerToken = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const platformToken = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    for (const path of ["multi-location", "white-label", "growth", "accreditation"]) {
      const response = await requestLocalApi(request, `/enterprise/phase-2/${path}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(response.ok(), path).toBeTruthy();
      const body = await response.json();
      expectNoSecrets(body);
      if (path === "accreditation") {
        expect(body.externalMonitoringVisibleToTenant).toBe(false);
        expect(body.externalMonitoring).toBeUndefined();
        expect(body.trustPack).toEqual(expect.arrayContaining(["incident_response_checklist", "data_retention_overview", "soc2_style_evidence_folder"]));
      }
    }

    const multi = await requestLocalApi(request, "/enterprise/phase-2/multi-location", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const multiBody = await multi.json();
    expect(multiBody.tenantIsolation).toBe(true);
    expect(multiBody.model).toEqual(expect.arrayContaining(["parent_company", "region", "branch", "depot", "location", "team"]));
    expect(multiBody.crossBranchDashboard).toBe("authorised_roles_only");

    const platformOverview = await requestLocalApi(request, "/admin/platform/overview", {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(platformOverview.ok()).toBeTruthy();
    expectNoSecrets(await platformOverview.json());
  });

  test("dashboard enterprise control room renders without overflow or admin leakage", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });

    await expect(page.getByTestId("phase2-enterprise-page")).toBeVisible();
    await expect(page.getByTestId("phase2-integrations")).toContainText("Xero");
    await expect(page.getByTestId("phase2-offline-field")).toContainText("No token storage");
    await expect(page.getByTestId("phase2-report-builder")).toContainText("Real data only");
    await expect(page.getByTestId("phase2-accounting-prelaunch")).toContainText("Live sync");
    await expect(page.getByTestId("phase2-ai-readiness")).toContainText("Model calls: off");
    await expect(page.getByTestId("phase2-accreditation")).toContainText("Platform assurance setup");
    await expect(page.locator("body")).not.toContainText("External monitoring");
    await expect(page.locator("body")).not.toContainText("External uptime monitor");
    await expect(page.locator("body")).not.toContainText("sk_live_");
    await expect(page.locator("body")).not.toContainText("refresh_token");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("platform admin sees deferred external monitor setup while tenant enterprise view stays quiet", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase2-enterprise-page")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("External monitor intentionally deferred");

    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-system-monitoring")).toBeVisible();
    await expect(page.getByTestId("platform-health-advanced-details")).toContainText(/External monitor intentionally deferred|External uptime monitoring is still not configured|not configured/i);
  });
});
