import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("dashboard workflows", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("bookings page exposes conversion workflow affordances", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
    await expect(page.getByText(`Booking ID ${fixtureRefs.convertibleBookingId}`)).toBeVisible();
    await expect(page.getByText(`Booking ID ${fixtureRefs.blockedBookingId}`)).toBeVisible();
    await expect(page.getByText(/Conversion blocked: missing customer name/i)).toBeVisible();

    const convertibleRow = page.locator(".operator-table__row", { hasText: fixtureRefs.convertibleBookingId }).first();
    await convertibleRow.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByRole("menu", { name: /row actions/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /convert to job/i })).toBeVisible();
  });

  test("billing readiness page exposes lifecycle controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: "Billing readiness", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.invoiceReadyJobRef)).toBeVisible();
    await expect(page.getByText(fixtureRefs.issuedJobRef)).toBeVisible();
    await page.getByTestId(`billing-issue-invoice-${"e2e-job-invoice-ready"}`).click();
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Invoice issued/i);
  });

  test("portal ops page exposes lifecycle state and actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/portal");
    await expect(page.getByRole("heading", { name: "Portal Ops", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.portalActiveJobRef, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.portalExpiredJobRef, { exact: true }).first()).toBeVisible();
    await page.getByTestId(`portal-regenerate-${"e2e-job-portal-expired"}`).first().click();
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Portal link regenerated/i);
  });

  test("technician page exposes queue actions and checklist context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/technician");
    await expect(page.getByRole("heading", { name: "Technician queue", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.technicianJobRef)).toBeVisible();
    await page.getByTestId(`technician-note-input-${"e2e-job-technician"}`).fill("E2E note from Playwright");
    const saveNoteButton = page.getByTestId(`technician-note-save-${"e2e-job-technician"}`);
    await saveNoteButton.scrollIntoViewIfNeeded();
    await saveNoteButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Field note saved/i);
  });

  test("command centre v2 refresh exposes busy feedback", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByRole("heading", { name: "Command Centre", exact: true })).toBeVisible();
    await expect(page.getByTestId("ccv2-search-input")).toBeVisible();
    await expect(page.getByText(fixtureRefs.commandCentreJobRef)).toBeVisible();

    await page.route(/\/jobs\/board-v2(\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    }, { times: 1 });

    const refreshButton = page.getByTestId("ccv2-refresh-button");
    if (await refreshButton.isDisabled()) {
      await expect(refreshButton).toHaveText(/Refreshing/i);
    } else {
      await refreshButton.evaluate((element: HTMLButtonElement) => element.click());
      await expect(refreshButton).toBeDisabled();
      await expect(refreshButton).toHaveText(/Refreshing/i);
    }
  });

  test("intelligence page loads its attention queue", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByRole("heading", { name: "Intelligence", exact: true })).toBeVisible();
    await expect(page.getByText(/needs attention|attention/i).first()).toBeVisible();
    await expect(page.getByText(/overdue|portal|dispatch|payment/i).first()).toBeVisible();
  });
});
