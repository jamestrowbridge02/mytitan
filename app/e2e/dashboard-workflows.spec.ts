import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("dashboard workflows", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("bookings page handles blocked and successful conversion flows", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
    await expect(page.getByText(`Booking ID ${fixtureRefs.convertibleBookingId}`)).toBeVisible();
    await expect(page.getByText(`Booking ID ${fixtureRefs.blockedBookingId}`)).toBeVisible();
    await expect(page.getByText(/Conversion blocked: missing customer name/i)).toBeVisible();

    const blockedRow = page.locator(".operator-table__row", { hasText: fixtureRefs.blockedBookingId }).first();
    await blockedRow.getByRole("button", { name: /more actions/i }).click();
    const blockedConvert = blockedRow.getByTestId(`booking-convert-${fixtureRefs.blockedBookingId}`);
    await expect(blockedConvert).toBeVisible();
    await expect(blockedConvert).toBeDisabled();
    await page.keyboard.press("Escape");

    const convertibleRow = page.locator(".operator-table__row", { hasText: fixtureRefs.convertibleBookingId }).first();
    await convertibleRow.scrollIntoViewIfNeeded();
    await convertibleRow.getByRole("button", { name: /more actions/i }).click();
    await Promise.all([
      page.waitForURL(/\/dashboard\/jobs\/.+/),
      convertibleRow.getByTestId(`booking-convert-${fixtureRefs.convertibleBookingId}`).click(),
    ]);
  });

  test("billing readiness page exposes lifecycle controls and state changes", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: "Billing readiness", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.invoiceReadyJobRef)).toBeVisible();
    await expect(page.getByText(fixtureRefs.issuedJobRef)).toBeVisible();
    await page.getByTestId(`billing-issue-invoice-${"e2e-job-invoice-ready"}`).click();
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Invoice issued/i);
    await expect(page.getByTestId(`billing-mark-paid-${"e2e-job-invoice-ready"}`)).toBeVisible();

    const issuedRow = page.locator(".operator-table__row", { hasText: fixtureRefs.issuedJobRef }).first();
    await issuedRow.getByRole("button", { name: /more actions/i }).click();
    const queueAction = issuedRow.getByTestId(`billing-queue-follow-up-${"e2e-job-issued"}`);
    await expect(queueAction).toBeVisible();
    await expect(queueAction).toBeEnabled();
  });

  test("portal ops page exposes lifecycle states and recovery actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/portal");
    await expect(page.getByRole("heading", { name: "Portal Ops", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.portalActiveJobRef, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.portalExpiredJobRef, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Link active/i).first()).toBeVisible();
    await expect(page.getByText(/Link expired/i).first()).toBeVisible();
    await expect(page.getByText(/No active link/i).first()).toBeVisible();
    await page.getByTestId(`portal-regenerate-${"e2e-job-portal-expired"}`).first().click();
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Portal link regenerated/i);
  });

  test("technician page exposes queue actions and checklist context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/technician");
    await expect(page.getByText(/queue$/i).first()).toBeVisible();
    await expect(page.getByText(fixtureRefs.technicianJobRef)).toBeVisible();
    await expect(page.getByText(/Workflow/i).first()).toBeVisible();
    const startButton = page.getByTestId(`technician-start-${"e2e-job-technician"}`);
    await expect(startButton).toBeVisible();
    const technicianRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await technicianRow.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByTestId(`technician-arrive-${"e2e-job-technician"}`)).toBeVisible();
    await page.getByTestId(`technician-note-input-${"e2e-job-technician"}`).fill("E2E note from Playwright");
    const saveNoteButton = page.getByTestId(`technician-note-save-${"e2e-job-technician"}`);
    await saveNoteButton.scrollIntoViewIfNeeded();
    await saveNoteButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Field note saved/i);
  });

  test("command centre v2 applies defaults and exposes modernized controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByRole("heading", { name: "Command Centre", exact: true })).toBeVisible();
    await expect(page.getByTestId("ccv2-search-input")).toBeVisible();
    await expect(page.getByText(fixtureRefs.commandCentreJobRef)).toBeVisible();
    await expect(page.getByTestId("ccv2-saved-view-select")).toHaveValue("e2e-board-view-default");
    await expect(page.getByTestId("ccv2-search-input")).toHaveValue("E2E");
    await expect(page.getByTestId("ccv2-realtime-state")).toContainText(/Realtime paused|Live workspace|Updated/i);

    await page.getByTestId(`ccv2-select-${"e2e-job-open"}`).evaluate((element: HTMLInputElement) => element.click());
    await expect(page.getByTestId("ccv2-selected-count")).toContainText("Selected: 1");
    await expect(page.getByTestId("ccv2-bulk-status-action")).toBeEnabled();

    await page.getByTestId("ccv2-save-view-trigger").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("ccv2-save-view-panel")).toBeVisible();
    await page.getByTestId("ccv2-save-view-input").fill("Playwright temp view");
    await expect(page.getByTestId("ccv2-save-view-submit")).toBeEnabled();
    await page.getByTestId("ccv2-save-view-cancel").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("ccv2-save-view-panel")).toHaveCount(0);

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

    await page.getByTestId(`ccv2-open-${"e2e-job-open"}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("ccv2-sidepanel")).toBeVisible();
  });

  test("settings workflow terminology persists onto core operator surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=workflow");
    await expect(page.getByTestId("settings-workflow-panel")).toBeVisible();
    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    const updateResponse = await request.put("http://127.0.0.1:3000/tenant/settings", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        businessConfigJson: {
          terminology: {
            jobs: "Work Orders",
            bookings: "Requests",
          },
          defaults: {
            commandCentreVersion: "v2",
          },
          navigation: {
            showIntelligence: true,
            showPortalOps: true,
            showTechnicianQueue: true,
          },
        },
      },
    });
    expect(updateResponse.ok()).toBeTruthy();
    await page.waitForTimeout(500);

    await page.goto("/dashboard/jobs");
    await expect(page.getByRole("heading", { name: "Work Orders", exact: true })).toBeVisible();

    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();

    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByText(/Operations brain for work orders/i)).toBeVisible();
  });

  test("intelligence page loads its attention queue", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByRole("heading", { name: "Intelligence", exact: true })).toBeVisible();
    await expect(page.getByText(/needs attention|attention/i).first()).toBeVisible();
    await expect(page.getByText(/overdue|portal|dispatch|payment/i).first()).toBeVisible();
  });
});
