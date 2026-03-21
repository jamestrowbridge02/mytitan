import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

test.describe("dashboard workflows", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("bookings page handles blocked and successful conversion flows", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/bookings");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(page.getByRole("heading", { name: "Bookings", exact: true })).toBeVisible();
    await expect(page.getByText(`Booking ID ${fixtureRefs.convertibleBookingId}`)).toBeVisible();
    await expect(page.getByText(`Booking ID ${fixtureRefs.blockedBookingId}`)).toBeVisible();

    const blockedRow = page.locator(".operator-table__row", { hasText: fixtureRefs.blockedBookingId }).first();
    await expect(blockedRow).toContainText(/Conversion blocked: missing customer name/i);
    await blockedRow.getByRole("button", { name: /more actions/i }).click();
    const blockedConvert = blockedRow.getByTestId(`booking-convert-${fixtureRefs.blockedBookingId}`);
    await expect(blockedConvert).toBeVisible();
    await expect(blockedConvert).toBeDisabled();
    await page.keyboard.press("Escape");

    const convertibleRow = page.locator(".operator-table__row", { hasText: fixtureRefs.convertibleBookingId }).first();
    await convertibleRow.scrollIntoViewIfNeeded();
    await convertibleRow.getByRole("button", { name: /more actions/i }).click();
    await convertibleRow.getByTestId(`booking-convert-${fixtureRefs.convertibleBookingId}`).evaluate((element: HTMLButtonElement) => element.click());
    const navigatedToJob = await page.waitForURL(/\/dashboard\/jobs\/.+/, { timeout: 5000 }).then(() => true).catch(() => false);
    if (!navigatedToJob) {
      await expect(page.getByTestId("operator-notice-success")).toContainText(/Converted booking|already linked/i);
    }
  });

  test("billing readiness page exposes lifecycle controls and state changes", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/billing/readiness");
    await expect(page.getByRole("heading", { name: "Billing readiness", exact: true })).toBeVisible();
    await expect(page.getByText(fixtureRefs.invoiceReadyJobRef)).toBeVisible();
    await expect(page.getByText(fixtureRefs.issuedJobRef)).toBeVisible();
    const invoiceReadyRow = page.locator(".operator-table__row", { hasText: fixtureRefs.invoiceReadyJobRef }).first();
    await invoiceReadyRow.getByTestId(`billing-issue-invoice-${"e2e-job-invoice-ready"}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Invoice issued/i);
    await expect(invoiceReadyRow.getByTestId(`billing-mark-paid-${"e2e-job-invoice-ready"}`)).toBeVisible();

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
    const activeRow = page.locator(".operator-table__row", { hasText: fixtureRefs.portalActiveJobRef }).first();
    const expiredRow = page.locator(".operator-table__row", { hasText: fixtureRefs.portalExpiredJobRef }).first();
    await expect(activeRow).toBeVisible();
    await expect(expiredRow).toBeVisible();
    await expect(activeRow).toContainText(/Link active/i);
    await expect(expiredRow).toContainText(/expired|Regeneration required/i);
    await expect(page.locator(".operator-table__row").filter({ hasText: "No active link" }).first()).toBeVisible();
    await expiredRow.getByTestId(`portal-regenerate-${"e2e-job-portal-expired"}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Portal link regenerated/i);
  });

  test("technician page exposes queue actions and checklist context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/technician");
    await expect(page.getByText(/queue$/i).first()).toBeVisible();
    const technicianRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await expect(technicianRow).toBeVisible();
    await expect(technicianRow.getByText(/Workflow/i).first()).toBeVisible();
    const startButton = page.getByTestId(`technician-start-${"e2e-job-technician"}`);
    await expect(startButton).toBeVisible();
    await technicianRow.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByTestId(`technician-arrive-${"e2e-job-technician"}`)).toBeVisible();
    await page.getByTestId(`technician-note-input-${"e2e-job-technician"}`).fill("E2E note from Playwright");
    const saveNoteButton = page.getByTestId(`technician-note-save-${"e2e-job-technician"}`);
    await saveNoteButton.scrollIntoViewIfNeeded();
    await saveNoteButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Field note saved/i);
    await expect(technicianRow.getByTestId("execution-record-card")).toBeVisible();
    await expect(technicianRow.getByTestId("execution-checklist")).toBeVisible();
  });

  test("technician can save and submit a completion record", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/technician");
    const technicianRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await technicianRow.getByRole("button", { name: /start record|open draft/i }).evaluate((element: HTMLButtonElement) => element.click());
    await technicianRow.getByPlaceholder("Execution summary").fill("Playwright completion summary");
    await technicianRow.getByTestId("execution-notes-input").fill("Playwright completion notes");
    await technicianRow.getByTestId("execution-checklist").locator('input[type="checkbox"]').first().check();
    await technicianRow.getByRole("button", { name: "Save draft" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Execution record saved/i);
    await technicianRow.getByTestId("execution-submit").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Completion submitted/i);
  });

  test("operator can review a submitted completion record on job detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/jobs/e2e-job-portal-active");
    await expect(page.getByTestId("execution-record-card")).toContainText(/SUBMITTED|ACKNOWLEDGED/i);
    await expect(page.getByTestId("execution-evidence-list")).toContainText(fixtureRefs.seededPortalArtifactLabel);
  });

  test("intelligence surfaces completion acknowledgement pressure", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByText(/Completion proofs awaiting acknowledgement/i).first()).toBeVisible();
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

  test("command centre shows missing required field badge", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/command-centre-v2");
    const token = await getToken(page);
    const fieldsResponse = await request.get("http://127.0.0.1:3000/custom-fields?entityType=job&visible=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fields = await fieldsResponse.json();
    const serialField = Array.isArray(fields) ? fields.find((field: any) => field?.key === fixtureRefs.customFieldJobSerialKey) : null;
    expect(serialField?.id).toBeTruthy();
    const resetResponse = await request.post("http://127.0.0.1:3000/custom-fields/values", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "job",
        entityId: fixtureRefs.commandCentreJobId,
        values: [{ fieldId: serialField.id, valueJson: null }],
      },
    });
    expect(resetResponse.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Command Centre", exact: true })).toBeVisible();
    const jobCard = page.locator(".integration-card", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(jobCard.getByTestId("ccv2-required-fields-warning")).toContainText("serial_number required");

    await jobCard.getByTestId(`ccv2-open-${fixtureRefs.commandCentreJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    const sidepanel = page.getByTestId("ccv2-sidepanel");
    await expect(sidepanel).toBeVisible();
    await expect(sidepanel.getByTestId("ccv2-required-fields-warning")).toContainText("serial_number required");
    await expect(sidepanel).toContainText(/Missing required fields: serial_number/i);
  });

  test("settings workflow terminology persists onto core operator surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=workflow");
    await expect(page.getByTestId("settings-workflow-panel")).toBeVisible();
    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    const settingsResponse = await request.get("http://127.0.0.1:3000/tenant/settings", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(settingsResponse.ok()).toBeTruthy();
    const currentSettings = await settingsResponse.json();
    const currentBusinessConfig = currentSettings?.businessConfigJson && typeof currentSettings.businessConfigJson === "object"
      ? currentSettings.businessConfigJson
      : {};
    const updateResponse = await request.put("http://127.0.0.1:3000/tenant/settings", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        businessConfigJson: {
          ...currentBusinessConfig,
          terminology: {
            ...(currentBusinessConfig?.terminology || {}),
            jobs: "Work Orders",
            bookings: "Requests",
          },
          defaults: {
            ...(currentBusinessConfig?.defaults || {}),
            commandCentreVersion: "v2",
          },
          navigation: {
            ...(currentBusinessConfig?.navigation || {}),
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
    await expect(page.getByText(/Use the live board to move work orders/i)).toBeVisible();
  });

  test("configured workflow stages render across operator surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);

    await page.goto("/dashboard/bookings");
    const bookingRow = page.locator(".operator-table__row", { hasText: fixtureRefs.convertibleBookingId }).first();
    await expect(bookingRow.getByTestId("workflow-stage-label")).toContainText("Confirmed Visit");

    await page.goto("/dashboard/jobs");
    const jobRow = page.locator(".operator-table__row", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(jobRow.getByTestId("workflow-stage-label")).toContainText("Ready for Dispatch");

    await page.goto("/dashboard/technician");
    const techRow = page.locator(".operator-table__row", { hasText: fixtureRefs.technicianJobRef }).first();
    await expect(techRow.getByTestId("workflow-stage-label")).toContainText(/Awaiting Arrival|Working On Site|Field Complete/);

    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByText(/Ready for Dispatch/i).first()).toBeVisible();
    await expect(page.getByText(/Booked In|Work Underway|Ready to Bill/i).first()).toBeVisible();
  });

  test("intelligence page loads its attention queue", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByRole("heading", { name: "Intelligence", exact: true })).toBeVisible();
    await expect(page.getByText(/needs attention|attention/i).first()).toBeVisible();
    await expect(page.getByText(/overdue|portal|dispatch|payment/i).first()).toBeVisible();
  });
});
