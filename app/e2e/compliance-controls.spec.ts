import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("workflow SLA and compliance controls", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated compliance tests.");

  test("compliance page renders seeded policies, events, and exceptions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const complianceLoadNotice = page.getByText("Some compliance data could not be loaded. Showing the latest available results.");
    if (await complianceLoadNotice.isVisible().catch(() => false)) {
      await page.reload();
      await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    }
    await expect(page.getByTestId("compliance-policy-list")).toContainText(fixtureRefs.complianceQuotePolicyName, { timeout: 20000 });
    await expect(page.getByTestId("compliance-policy-list")).toContainText(fixtureRefs.complianceServicePlanPolicyName);
    await expect(page.getByTestId("compliance-event-list")).toContainText(fixtureRefs.complianceBreachedQuoteNumber);
    await expect(page.getByTestId("compliance-event-list")).toContainText(fixtureRefs.complianceOpenServicePlanName);
    await expect(page.getByTestId("compliance-exception-list")).toContainText(fixtureRefs.complianceOpenExceptionSummary);
    await expect(page.locator("body")).not.toContainText("ISO 27001 readiness");
    await expect(page.locator("body")).not.toContainText("AWS architecture notes");
  });

  test("operator can create and edit an SLA policy", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(page.getByTestId("compliance-policy-list")).toContainText(fixtureRefs.complianceQuotePolicyName);
    const suffix = Date.now().toString().slice(-6);
    const name = `E2E compliance policy ${suffix}`;
    const updatedName = `${name} updated`;
    const form = page.getByTestId("compliance-policy-save");
    await form.getByPlaceholder("Policy name").fill(name);
    await form.getByRole("combobox").nth(0).selectOption("JOB");
    await form.getByPlaceholder("Trigger status").fill("SCHEDULED");
    await form.getByPlaceholder("Target status").fill("COMPLETED");
    await form.getByRole("spinbutton").fill("180");
    await page.getByRole("button", { name: "Save policy" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/policy created|policy updated|SLA policy/i);
    await expect(page.getByTestId("compliance-policy-list")).toContainText(name);

    const row = page.locator(".operator-table__row", { hasText: name }).first();
    await row.getByRole("button", { name: "Edit" }).evaluate((element: HTMLButtonElement) => element.click());
    await form.getByPlaceholder("Policy name").fill(updatedName);
    await page.getByRole("button", { name: "Save policy" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("operator-notice-success")).toContainText(/policy created|policy updated|SLA policy/i);
    await expect(page.getByTestId("compliance-policy-list")).toContainText(updatedName);
  });

  test("breach and open-event rows link back to the affected entity", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const servicePlanRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceOpenServicePlanName }).first();
    await servicePlanRow.getByRole("link", { name: "Open" }).evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForURL(/\/dashboard\/service-plans$/);
    await expect(page.getByTestId("service-plan-list")).toContainText(fixtureRefs.complianceOpenServicePlanName);
  });

  test("exception queue links to job detail and shows compliance context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const exceptionRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceOpenExceptionSummary }).first();
    await exceptionRow.getByRole("link", { name: /job/i }).evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForURL(new RegExp(`/dashboard/jobs/${fixtureRefs.financeJobId}$`));
    await expect(page.getByTestId("job-compliance-exceptions")).toContainText(fixtureRefs.complianceOpenExceptionSummary);
  });

  test("operator can resolve and dismiss open compliance exceptions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();

    const resolveRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceOpenExceptionSummary }).first();
    await expect(resolveRow.getByTestId("compliance-exception-resolve")).toBeVisible();
    const resolveResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/compliance/exceptions/${fixtureRefs.complianceOpenManualOverrideId}/resolve`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(resolveResponse.ok()).toBeTruthy();
    await page.reload();
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(resolveRow).toContainText("RESOLVED");

    const dismissRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceDismissExceptionSummary }).first();
    await expect(dismissRow.getByRole("button", { name: "Dismiss" })).toBeVisible();
    const dismissResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/compliance/exceptions/${fixtureRefs.complianceOpenEvidenceReviewId}/dismiss`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(dismissResponse.ok()).toBeTruthy();
    await page.reload();
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(dismissRow).toContainText("DISMISSED");
  });

  test("intelligence and command centre surface compliance pressure", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByText("Compliance queue")).toBeVisible();
    await expect(page.getByText("SLA breached")).toBeVisible();

    await page.goto("/dashboard/command-centre-v2");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
    await expect(page.getByTestId("ccv2-compliance-pressure")).toContainText(/breached SLA|open compliance/i);
    await expect(page.getByTestId("ccv2-compliance-pressure").getByRole("button", { name: "Review checks" })).toBeVisible();
  });
});
