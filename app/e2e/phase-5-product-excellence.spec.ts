import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("phase 5 product excellence and commercial readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("dashboard KPIs are one-click links into source records", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const kpis = [
      { testId: "dashboard-kpi-jobs-today", href: /\/dashboard\/jobs/ },
      { testId: "dashboard-kpi-revenue-today", href: /\/dashboard\/finance/ },
      { testId: "dashboard-kpi-technicians-active", href: /\/dashboard\/technician/ },
      { testId: "dashboard-kpi-pending-approvals", href: /\/dashboard\/portal/ },
    ];
    for (const kpi of kpis) {
      await expect(page.getByTestId(kpi.testId)).toBeVisible();
      await expect(page.getByTestId(kpi.testId)).toHaveAttribute("href", kpi.href);
      await expect(page.getByTestId(kpi.testId)).toContainText(/Open/);
    }
  });

  test("technician mobile surface compresses to my day, next job, start work, and sync status", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);

    await page.goto("/dashboard/technician", { waitUntil: "networkidle" });
    await expect(page.getByTestId("technician-my-day-strip")).toBeVisible();
    await expect(page.getByTestId("technician-my-day-strip")).toContainText(/My Day|Next Job|Start Work|Sync Status/i);
    await expect(page.getByTestId("technician-next-job-action")).toHaveAttribute("href", /\/dashboard\/jobs\/|\/dashboard\/scheduling/);
    await expect(page.getByTestId("technician-sync-status-action")).toHaveAttribute("href", "/dashboard/technician/offline");
  });

  test("customer portal reads as a service account with clear customer sections", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/portal/job/${fixtureRefs.portalToken}`, { waitUntil: "networkidle" });

    await expect(page.locator("body")).toContainText(/My service account|Your service account/i);
    await expect(page.getByTestId("public-portal-self-service-hub")).toContainText(/Your service account|Active status|Booking history|Invoices and receipts/i);
    await expect(page.getByTestId("public-portal-work-history")).toContainText(/Service history|recent/i);
    await expect(page.getByTestId("public-portal-documents")).toContainText(/Documents|downloads/i);
    await expect(page.locator("body")).not.toContainText(/platform admin|internal software|internal host|fake tracking/i);
  });

  test("enterprise trust pack presents direct tenant-safe evidence links", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase5-enterprise-trust-pack")).toBeVisible();
    await expect(page.getByTestId("phase5-enterprise-trust-pack")).toContainText(/Audit exports|Access reviews|Backup evidence|DR readiness|Retention readiness|Compliance readiness/i);
    const cards = page.locator('[data-testid^="phase5-trust-"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let index = 0; index < count; index += 1) {
      await expect(cards.nth(index)).toHaveAttribute("href", /\/dashboard\//);
      await expect(cards.nth(index)).toContainText(/Open evidence/);
    }
    await expect(page.getByTestId("phase5-enterprise-trust-pack")).toContainText(/Platform infrastructure setup stays out of the tenant blocker list/i);
  });
});
