import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("workspace governance", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("settings are hidden and blocked for non-admin roles", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.dispatcherEmail, fixtureRefs.dispatcherPassword);

    await page.goto("/dashboard");
    await expect(page.locator('a[href="/dashboard/settings"]')).toHaveCount(0);

    await page.goto("/dashboard/settings");
    await expect(page.getByTestId("settings-governance-blocked")).toBeVisible();
  });

  test("finance roles can run billing actions but not portal lifecycle actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.financeEmail, fixtureRefs.financePassword);

    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: "Billing readiness", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.financeReadyJobRef)).toBeVisible();
    await page.getByTestId(`billing-issue-invoice-${fixtureRefs.financeJobId}`).click();
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Invoice issued/i);

    await page.goto("/dashboard/portal");
    await expect(page.getByTestId("portal-governance-blocked")).toBeVisible();
  });

  test("technician roles can execute field actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);

    await page.goto("/dashboard/technician");
    await expect(page.getByText(fixtureRefs.technicianRoleJobRef)).toBeVisible();
    await page.getByTestId(`technician-note-input-${fixtureRefs.technicianRoleJobId}`).fill("Governance technician note");
    await page.getByTestId(`technician-note-save-${fixtureRefs.technicianRoleJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Field note saved/i);
  });

  test("viewer navigation hides governed modules", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.viewerEmail, fixtureRefs.viewerPassword);

    await page.goto("/dashboard");
    await expect(page.locator('a[href="/dashboard/jobs"]').first()).toBeVisible();
    await expect(page.locator('a[href="/dashboard/settings"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/billing"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/portal"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/technician"]')).toHaveCount(0);
    await expect(page.locator('a[href="/dashboard/intelligence"]')).toHaveCount(0);
  });
});
