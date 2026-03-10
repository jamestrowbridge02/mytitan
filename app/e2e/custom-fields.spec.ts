import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

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
    const jobRow = page.locator(".operator-table__row", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(jobRow.getByTestId("custom-field-stage-warning")).toContainText("serial_number required");

    await jobRow.getByRole("button", { name: /more actions/i }).click();
    await page.getByTestId(`job-custom-fields-${fixtureRefs.commandCentreJobId}`).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("custom-fields-card-job")).toBeVisible();
    await page.getByTestId(`custom-field-input-${fixtureRefs.customFieldJobSerialKey}`).fill("CC-SN-001");
    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();
    const fieldRows = await request.get("http://127.0.0.1:3000/custom-fields?entityType=job&visible=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fieldList = await fieldRows.json();
    const serialField = Array.isArray(fieldList) ? fieldList.find((field: any) => field?.key === fixtureRefs.customFieldJobSerialKey) : null;
    expect(serialField?.id).toBeTruthy();
    const saveResponse = await request.post("http://127.0.0.1:3000/custom-fields/values", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        entityType: "job",
        entityId: fixtureRefs.commandCentreJobId,
        values: [{ fieldId: serialField.id, valueJson: "CC-SN-001" }],
      },
    });
    expect(saveResponse.ok()).toBeTruthy();
    await page.reload();
    const refreshedRow = page.locator(".operator-table__row", { hasText: fixtureRefs.commandCentreJobRef }).first();
    await expect(refreshedRow.getByTestId("custom-field-stage-warning")).toHaveCount(0);
    await expect(refreshedRow).toContainText("CC-SN-001");
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
});
