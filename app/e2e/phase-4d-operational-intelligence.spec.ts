import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("phase 4D operational intelligence", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("business health and operational intelligence are tenant-only real-data views", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    const [healthResponse, intelligenceResponse] = await Promise.all([
      requestLocalApi(request, "/metrics/business-health", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      requestLocalApi(request, "/metrics/intelligence", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    expect(healthResponse.ok()).toBeTruthy();
    expect(intelligenceResponse.ok()).toBeTruthy();

    const health = await healthResponse.json();
    expect(health.platformDiagnosticsVisible).toBe(false);
    expect(health.source).toBe("tenant_business_records");
    expect(health.summary.bookingsTrend).toEqual(expect.objectContaining({ current: expect.any(Number), previous: expect.any(Number), delta: expect.any(Number) }));
    expect(health.summary.invoiceAgeing.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(health.locations)).toBe(true);
    expect(JSON.stringify(health)).not.toContain("STRIPE_SECRET_KEY");
    expect(JSON.stringify(health)).not.toContain("whsec_");

    const intelligence = await intelligenceResponse.json();
    expect(Array.isArray(intelligence.operationalIssues)).toBe(true);
    const serializedIssues = JSON.stringify(intelligence.operationalIssues);
    expect(serializedIssues).toContain("impact");
    expect(serializedIssues).toContain("href");

    await page.goto("/dashboard/intelligence", { waitUntil: "networkidle" });
    await expect(page.getByTestId("business-health-engine")).toBeVisible();
    await expect(page.getByTestId("business-health-summary")).toContainText(/Bookings trend|Unpaid value|Completion velocity/);
    await expect(page.getByTestId("business-health-engine")).toContainText("Platform diagnostics visible: no");
  });

  test("calendar is location-first with optional technician overlay and no horizontal viewport overflow", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/dashboard/calendar", { waitUntil: "networkidle" });
    await expect(page.getByTestId("calendar-location-authority")).toBeVisible();
    await expect(page.getByTestId("calendar-technician-overlay-toggle")).toBeVisible();
    await expect(page.getByTestId("calendar-time-grid")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await page.getByTestId("calendar-technician-overlay-toggle").check();
    await expect(page.getByTestId("calendar-time-grid")).toBeVisible();
  });

  test("single job authority and media folders keep completed work in one record", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto(`/dashboard/jobs/${fixtureRefs.invoiceReadyJobId}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("single-job-authority-view")).toBeVisible();
    await expect(page.getByTestId("single-job-authority-coverage")).toContainText("Booking");
    await expect(page.getByTestId("single-job-authority-coverage")).toContainText("Invoice");
    await expect(page.getByTestId("single-job-authority-coverage")).toContainText("PDF snapshot");

    await expect(page.getByTestId("artifact-card-job")).toBeVisible();
    await expect(page.getByTestId("artifact-search-filter-job")).toBeVisible();
    await page.getByTestId("artifact-label-job").fill(`Phase 4D damage proof ${Date.now()}`);
    await page.getByTestId("artifact-kind-job").selectOption("DAMAGE_PHOTO");
    await page.getByTestId("artifact-file-job").setInputFiles({
      name: "phase-4d-damage-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Damage evidence placeholder for E2E folder/search coverage.", "utf8"),
    });
    await page.getByTestId("artifact-upload-job").click();
    await expect(page.getByTestId("artifact-card-job")).toContainText("damage photos");
    await page.getByTestId("artifact-search-job").fill("damage proof");
    await expect(page.getByTestId("artifact-card-job")).toContainText("DAMAGE PHOTO");
  });

  test("expanded account health flags unsafe operational setup without automatic mutation", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const current = await (await requestLocalApi(request, "/tenant/settings", {
      headers: { Authorization: `Bearer ${token}` },
    })).json();

    try {
      const updateResponse = await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          businessConfigJson: {
            ...(current.businessConfigJson || {}),
            bookingWorkflow: {
              ...((current.businessConfigJson || {}).bookingWorkflow || {}),
              autoCreateInvoiceDraftOnCompletion: true,
            },
            portalControls: {
              ...((current.businessConfigJson || {}).portalControls || {}),
              portalEnabled: true,
              customerBookingEnabled: true,
              depositsRequired: true,
              allowBookingWithoutDeposit: false,
            },
          },
        },
      });
      expect(updateResponse.ok()).toBeTruthy();

      const healthResponse = await requestLocalApi(request, "/tenant/account-health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(healthResponse.ok()).toBeTruthy();
      const health = await healthResponse.json();
      const depositIssue = health.issues.find((issue: any) => issue.key === "deposit_required_provider_readiness");
      expect(depositIssue?.autoFixAvailable).toBe(false);
      expect(health.platformDiagnosticsVisible).toBe(false);
    } finally {
      await requestLocalApi(request, "/tenant/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          businessConfigJson: current.businessConfigJson || {},
        },
      });
    }
  });
});
