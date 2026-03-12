import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function getVisibleField(request: APIRequestContext, token: string, entityType: string, key: string) {
  const response = await request.get(`http://127.0.0.1:3000/custom-fields?entityType=${entityType}&visible=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const fields = await response.json();
  const field = Array.isArray(fields) ? fields.find((item: any) => item?.key === key) : null;
  expect(field?.id).toBeTruthy();
  return field;
}

async function setCustomFieldValue(request: APIRequestContext, token: string, entityType: string, entityId: string, fieldId: string, valueJson: unknown) {
  const response = await request.post("http://127.0.0.1:3000/custom-fields/values", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      entityType,
      entityId,
      values: [{ fieldId, valueJson }],
    },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("custom fields", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("admins can create a workspace custom field", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=custom_fields");
    await expect(page.getByTestId("custom-field-list")).toBeVisible();

    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    const fieldsResponse = await request.get("http://127.0.0.1:3000/custom-fields", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const existingFields = await fieldsResponse.json();
    for (const field of Array.isArray(existingFields) ? existingFields.filter((item: any) => item?.key === "site_access_notes") : []) {
      await request.delete(`http://127.0.0.1:3000/custom-fields/${field.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    await page.reload();
    await expect(page.getByTestId("custom-field-list")).toBeVisible();

    await page.getByTestId("custom-field-create").evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("custom-field-entity").selectOption("job");
    await page.getByTestId("custom-field-key").fill("site_access_notes");
    await page.getByTestId("custom-field-label").fill("Site access notes");
    await page.getByTestId("custom-field-type").selectOption("text");
    await page.getByTestId("custom-field-save").evaluate((element: HTMLButtonElement) => element.click());

    await expect(page.getByTestId("operator-notice-success")).toContainText(/Custom field created/i);
    await expect(page.getByTestId("custom-field-list")).toContainText("Site access notes");
  });

  test("job custom fields render, save, and satisfy stage requirements", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/jobs");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const token = await getToken(page);
    const serialField = await getVisibleField(request, token, "job", fixtureRefs.customFieldJobSerialKey);
    await setCustomFieldValue(request, token, "job", fixtureRefs.commandCentreJobId, serialField.id, null);
    await page.reload();
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const jobRow = page.locator(".operator-table__row", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(jobRow.getByTestId("custom-field-stage-warning")).toContainText("serial_number required");

    await jobRow.scrollIntoViewIfNeeded();
    await jobRow.getByRole("button", { name: /more actions/i }).evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId(`job-custom-fields-${fixtureRefs.commandCentreJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("custom-fields-card-job")).toBeVisible();
    await page.getByTestId(`custom-field-input-${fixtureRefs.customFieldJobSerialKey}`).fill("CC-SN-001");
    await setCustomFieldValue(request, token, "job", fixtureRefs.commandCentreJobId, serialField.id, "CC-SN-001");
    await page.reload();
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const refreshedRow = page.locator(".operator-table__row", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(refreshedRow.getByTestId("custom-field-stage-warning")).toHaveCount(0);
    await expect(refreshedRow).toContainText("CC-SN-001");
  });

  test("stage block when required field is missing", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/dashboard/jobs/${fixtureRefs.automationJobId}`);
    const token = await getToken(page);
    const warrantyField = await getVisibleField(request, token, "job", fixtureRefs.customFieldWarrantyKey);

    const resetResponse = await request.patch(`http://127.0.0.1:3000/jobs/${fixtureRefs.automationJobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
    expect(resetResponse.ok()).toBeTruthy();
    await setCustomFieldValue(request, token, "job", fixtureRefs.automationJobId, warrantyField.id, null);

    await page.reload();
    await page.getByRole("button", { name: /mark completed/i }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/required custom fields/i).first()).toBeVisible();
    await expect(page.getByText(/warranty_status/i).first()).toBeVisible();
  });

  test("stage allowed when required field is present", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/dashboard/jobs/${fixtureRefs.automationJobId}`);
    const token = await getToken(page);
    const warrantyField = await getVisibleField(request, token, "job", fixtureRefs.customFieldWarrantyKey);

    const resetResponse = await request.patch(`http://127.0.0.1:3000/jobs/${fixtureRefs.automationJobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
    expect(resetResponse.ok()).toBeTruthy();
    await setCustomFieldValue(request, token, "job", fixtureRefs.automationJobId, warrantyField.id, "active");

    await page.reload();
    await page.getByRole("button", { name: /mark completed/i }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/Status updated to COMPLETED/i)).toBeVisible();
  });

  test("automation rules can use custom field conditions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=automation_rules");
    await expect(page.getByTestId("settings-automation-rules-panel")).toBeVisible();

    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    const ruleName = "Playwright expired warranty follow-up";
    const rulesResponse = await request.get("http://127.0.0.1:3000/automations/workspace-rules", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const existingRules = await rulesResponse.json();
    for (const rule of Array.isArray(existingRules) ? existingRules.filter((item: any) => String(item?.name || "") === ruleName) : []) {
      await request.delete(`http://127.0.0.1:3000/automations/workspace-rules/${rule.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    await page.reload();
    await page.getByTestId("automation-rule-new").evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("automation-rule-name").fill(ruleName);
    await page.getByTestId("automation-rule-trigger").selectOption("job.completed");
    await page.getByTestId("automation-rule-custom-field-mode").selectOption("equals");
    await page.getByTestId("automation-rule-custom-field-key").selectOption(fixtureRefs.customFieldWarrantyKey);
    await page.getByTestId("automation-rule-custom-field-value").fill("expired");
    await page.getByTestId("automation-rule-save").evaluate((element: HTMLButtonElement) => element.click());

    await expect(page.getByTestId("operator-notice-success")).toContainText(/Automation rule created/i);
    await expect(page.getByTestId("automation-rule-list")).toContainText(ruleName);
    await expect(page.getByTestId("automation-rule-list")).toContainText("warranty_status equals expired");
  });

  test("automation rule using workflowStageReady creates a reminder run", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=automation_rules");
    await expect(page.getByTestId("settings-automation-rules-panel")).toBeVisible();

    const token = await getToken(page);
    const ruleName = "Playwright workflow stage readiness reminder";
    const rulesResponse = await request.get("http://127.0.0.1:3000/automations/workspace-rules", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const existingRules = await rulesResponse.json();
    for (const rule of Array.isArray(existingRules) ? existingRules.filter((item: any) => String(item?.name || "") === ruleName) : []) {
      await request.delete(`http://127.0.0.1:3000/automations/workspace-rules/${rule.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    const warrantyField = await getVisibleField(request, token, "job", fixtureRefs.customFieldWarrantyKey);
    const resetResponse = await request.patch(`http://127.0.0.1:3000/jobs/${fixtureRefs.automationJobId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { status: "IN_PROGRESS", completedAt: null },
    });
    expect(resetResponse.ok()).toBeTruthy();
    await setCustomFieldValue(request, token, "job", fixtureRefs.automationJobId, warrantyField.id, "active");

    await page.reload();
    await page.getByTestId("automation-rule-new").evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("automation-rule-name").fill(ruleName);
    await page.getByTestId("automation-rule-trigger").selectOption("job.completed");
    await page.getByTestId("automation-rule-workflow-stage-ready").selectOption("completed");
    await page.getByTestId("automation-rule-note").fill("Workflow stage readiness reminder");
    await page.getByTestId("automation-rule-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/Automation rule created/i);

    const completeResponse = await request.patch(`http://127.0.0.1:3000/jobs/${fixtureRefs.automationJobId}/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: { status: "COMPLETED" },
    });
    expect(completeResponse.ok()).toBeTruthy();

    await expect.poll(async () => {
      const runsResponse = await request.get("http://127.0.0.1:3000/automations/runs?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const runs = await runsResponse.json();
      return Array.isArray(runs)
        ? runs.some((run: any) => String(run?.payloadJson?.automationRuleName || "") === ruleName)
        : false;
    }).toBeTruthy();

    await page.reload();
    await expect(page.getByTestId("automation-rule-list")).toContainText(ruleName);
    await expect(page.getByTestId("automation-rule-list")).toContainText("Workflow stage ready: completed");
    await expect(page.getByTestId("automation-run-list")).toContainText(ruleName);
  });
});
