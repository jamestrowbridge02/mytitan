import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("workflow SLA and compliance controls", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated compliance tests.");

  test("compliance page renders seeded policies, events, and exceptions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    await expect(page.getByTestId("compliance-policy-list")).toContainText(fixtureRefs.complianceQuotePolicyName);
    await expect(page.getByTestId("compliance-policy-list")).toContainText(fixtureRefs.complianceServicePlanPolicyName);
    await expect(page.getByTestId("compliance-event-list")).toContainText(fixtureRefs.complianceBreachedQuoteNumber);
    await expect(page.getByTestId("compliance-event-list")).toContainText(fixtureRefs.complianceOpenServicePlanName);
    await expect(page.getByTestId("compliance-exception-list")).toContainText(fixtureRefs.complianceOpenExceptionSummary);
  });

  test("operator can create and edit an SLA policy", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
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
    await expect(page.getByTestId("compliance-policy-list")).toContainText(name);

    const row = page.locator(".operator-table__row", { hasText: name }).first();
    await row.getByRole("button", { name: "Edit" }).evaluate((element: HTMLButtonElement) => element.click());
    await form.getByPlaceholder("Policy name").fill(updatedName);
    await page.getByRole("button", { name: "Save policy" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("compliance-policy-list")).toContainText(updatedName);
  });

  test("breach and open-event rows link back to the affected entity", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    const servicePlanRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceOpenServicePlanName }).first();
    await servicePlanRow.getByRole("link", { name: "Open" }).evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForURL(/\/dashboard\/service-plans$/);
    await expect(page.getByTestId("service-plan-list")).toContainText(fixtureRefs.complianceOpenServicePlanName);
  });

  test("exception queue links to job detail and shows compliance context", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");
    const exceptionRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceOpenExceptionSummary }).first();
    await exceptionRow.getByRole("link", { name: /job/i }).evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForURL(new RegExp(`/dashboard/jobs/${fixtureRefs.financeJobId}$`));
    await expect(page.getByTestId("job-compliance-exceptions")).toContainText(fixtureRefs.complianceOpenExceptionSummary);
  });

  test("operator can resolve and dismiss open compliance exceptions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/compliance");

    const resolveRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceOpenExceptionSummary }).first();
    await resolveRow.getByTestId("compliance-exception-resolve").evaluate((element: HTMLButtonElement) => element.click());
    await expect(resolveRow).toContainText("RESOLVED");

    const dismissRow = page.locator(".operator-table__row", { hasText: fixtureRefs.complianceDismissExceptionSummary }).first();
    await dismissRow.getByRole("button", { name: "Dismiss" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(dismissRow).toContainText("DISMISSED");
  });

  test("intelligence and command centre surface compliance pressure", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByText("Compliance queue")).toBeVisible();
    await expect(page.getByText("SLA breached")).toBeVisible();

    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByTestId("ccv2-compliance-pressure")).toContainText(/breached SLA|open compliance/i);
    await expect(page.getByTestId("ccv2-compliance-pressure").getByRole("button", { name: "Open compliance" })).toBeVisible();
  });
});
