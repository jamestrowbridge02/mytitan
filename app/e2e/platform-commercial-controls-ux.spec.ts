import { expect, test } from "@playwright/test";
import { cleanupGeneratedWorkspace, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("platform commercial controls UX", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running platform commercial controls tests.");

  test("platform admin can open Tenant 360 and manage commercial actions without support mode", async ({ page, request }) => {
    const suffix = Date.now();
    const companyName = `Commercial UX ${suffix}`;
    const signup = await requestLocalApi(request, "/auth/signup", {
      method: "POST",
      data: {
        companyName,
        email: `commercial-ux-${suffix}@example.test`,
        password: "MyTitanCommercialUx!2026",
      },
    });
    expect(signup.ok()).toBeTruthy();
    const signupBody = await signup.json();
    const tenantId = String(signupBody?.company?.id || "");
    const ownerToken = String(signupBody?.token || "");
    expect(tenantId).toBeTruthy();

    try {
      await installApiProxy(page, request);
      await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
      await page.goto("/platform", { waitUntil: "networkidle" });
      await page.getByTestId("platform-tenant-search-input").fill(companyName);
      await page.getByTestId("platform-tenant-search-submit").click();

      await expect(page.getByTestId(`platform-tenant-open-tenant-360-${tenantId}`)).toBeVisible();
      await expect(page.getByTestId(`platform-tenant-edit-commercials-${tenantId}`)).toBeVisible();
      await expect(page.getByTestId(`platform-tenant-result-${tenantId}`)).toContainText("Start Support Mode");
      await page.getByTestId(`platform-tenant-open-tenant-360-${tenantId}`).click();

      await expect(page).toHaveURL(new RegExp(`/platform/tenants/${tenantId}`));
      await expect(page.getByTestId("platform-tenant-360")).toBeVisible();
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("Actual monthly price");
      await expect(page.getByTestId("tenant-360-commercial-actions")).toBeVisible();
      await expect(page.getByTestId("tenant-360-commercial-tab")).toContainText("Commercial Actions");
      await expect(page.getByText("Start timed support mode")).toHaveCount(0);

      async function saveAction(action: string, reason: string) {
        await page.getByTestId(`tenant-360-action-${action}`).click();
        await page.getByTestId("tenant-360-commercial-reason").fill(reason);
        await page.getByTestId("tenant-360-commercial-confirm").check();
        await page.getByTestId("tenant-360-commercial-save").click();
        await expect(page.getByTestId("tenant-360-commercial-success")).toContainText("Audit reference");
      }

      await page.getByTestId("tenant-360-action-set_monthly_price").click();
      await page.getByTestId("tenant-360-monthly-price").fill("33.33");
      await saveAction("set_monthly_price", "E2E custom monthly price");
      await expect(page.getByTestId("tenant-360-actual-monthly-price")).toContainText("33.33");

      await page.getByTestId("tenant-360-action-set_annual_price").click();
      await page.getByTestId("tenant-360-annual-price").fill("333.30");
      await saveAction("set_annual_price", "E2E custom annual price");
      await expect(page.getByTestId("tenant-360-actual-annual-price")).toContainText("333.30");

      await page.getByTestId("tenant-360-action-extend_trial").click();
      await page.getByTestId("tenant-360-trial-extend-days").fill("5");
      await saveAction("extend_trial", "E2E extend trial days");

      const customTrialEnd = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await page.getByTestId("tenant-360-action-set_trial_end").click();
      await page.getByTestId("tenant-360-trial-end-date").fill(customTrialEnd);
      await saveAction("set_trial_end", "E2E custom trial end");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText(String(new Date(`${customTrialEnd}T00:00:00.000Z`).getUTCDate()));

      await page.getByTestId("tenant-360-action-set_monthly_allowance").click();
      await page.getByTestId("tenant-360-monthly-allowance").fill("77");
      await saveAction("set_monthly_allowance", "E2E monthly allowance");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("77");

      await page.getByTestId("tenant-360-action-add_one_off_credits").click();
      await page.getByTestId("tenant-360-one-off-credits").fill("3");
      await saveAction("add_one_off_credits", "E2E one off credits");

      await page.getByTestId("tenant-360-action-add_recurring_extra").click();
      await page.getByTestId("tenant-360-recurring-extra").fill("6");
      await saveAction("add_recurring_extra", "E2E recurring extra");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("6");

      await page.getByTestId("tenant-360-action-grant_job_pack").click();
      await page.getByTestId("tenant-360-job-pack-grant").fill("4");
      await saveAction("grant_job_pack", "E2E grant job pack");

      await saveAction("pause_account", "E2E commercial pause");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("Paused");
      await saveAction("resume_account", "E2E commercial resume");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("Active");

      await page.getByTestId("tenant-360-action-add_billing_note").click();
      await page.getByTestId("tenant-360-billing-note").fill("E2E internal billing note");
      await saveAction("add_billing_note", "E2E billing note");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("E2E internal billing note");

      await saveAction("clear_custom_price", "E2E clear custom prices");
      await expect(page.getByTestId("tenant-360-commercial-summary")).toContainText("Custom price active");
      await expect(page.getByTestId("tenant-360-commercial-history")).toContainText("Before=");
      await expect(page.getByTestId("tenant-360-commercial-history")).toContainText("After=");

      const ownerContext = await page.context().browser()?.newContext();
      const ownerPage = await ownerContext?.newPage();
      if (ownerPage) {
        await ownerPage.addInitScript((token) => window.localStorage.setItem("mytitan_token", String(token)), ownerToken);
        await ownerPage.goto(`/platform/tenants/${tenantId}`, { waitUntil: "networkidle" });
        await expect(ownerPage.getByTestId("platform-tenant-360-forbidden")).toBeVisible();
        await ownerContext?.close();
      }
    } finally {
      await cleanupGeneratedWorkspace(request, ownerToken);
    }
  });
});
