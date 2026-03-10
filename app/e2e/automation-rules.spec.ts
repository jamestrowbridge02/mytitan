import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("automation rules", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("creates a workspace automation rule and logs a completed run", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=automation_rules");
    await expect(page.getByTestId("settings-automation-rules-panel")).toBeVisible();

    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();

    const rulesResponse = await request.get("http://127.0.0.1:3000/automations/workspace-rules", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(rulesResponse.ok()).toBeTruthy();
    const existingRules = await rulesResponse.json();
    const ruleName = "Playwright job completion reminder";
    const staleRules = Array.isArray(existingRules)
      ? existingRules.filter((rule: any) => String(rule?.name || "") === ruleName)
      : [];

    for (const rule of staleRules) {
      const deleteResponse = await request.delete(`http://127.0.0.1:3000/automations/workspace-rules/${rule.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(deleteResponse.ok()).toBeTruthy();
    }

    await page.reload();
    await expect(page.getByTestId("settings-automation-rules-panel")).toBeVisible();

    await page.getByTestId("automation-rule-new").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("automation-rule-editor")).toBeVisible();

    await page.getByTestId("automation-rule-name").fill(ruleName);
    await page.getByTestId("automation-rule-trigger").selectOption("job.completed");
    await page.getByTestId("automation-rule-action").selectOption("create_reminder");
    await page.getByTestId("automation-rule-delay-days").fill("2");
    await page.getByTestId("automation-rule-note").fill("Playwright automation follow-up");
    await page.getByTestId("automation-rule-save").evaluate((element: HTMLButtonElement) => element.click());

    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Automation rule created/i);
    await expect(page.getByTestId("automation-rule-list")).toContainText(ruleName);

    await page.goto("/dashboard/technician");
    await expect(page.getByText(fixtureRefs.automationJobRef)).toBeVisible();
    await page.getByTestId(`technician-complete-${"e2e-job-automation"}`).click();
    await expect(page.getByTestId("operator-notice-success")).toBeVisible();
    await expect(page.getByTestId("operator-notice-message")).toContainText(/Job marked completed/i);

    await page.goto("/dashboard/settings?tab=automation_rules");
    await expect(page.getByTestId("settings-automation-rules-panel")).toBeVisible();
    await expect(page.getByText(ruleName).first()).toBeVisible();
    await expect(page.getByTestId("automation-run-row").filter({ hasText: ruleName }).first()).toBeVisible();
    await expect(page.getByTestId("automation-run-row").filter({ hasText: "job.completed" }).first()).toBeVisible();
  });
});
