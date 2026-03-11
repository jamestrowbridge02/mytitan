import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("integration platform foundation", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("API token creation reveals the token once", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/integrations");

    await page.getByLabel("Token name").fill("Playwright token");
    await page.getByRole("button", { name: "Create API token", exact: true }).evaluate((element: HTMLButtonElement) => element.click());

    await expect(page.getByText("Copy this token now.")).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "mtit_" }).first()).toBeVisible();
    await expect(page.getByText("Playwright token").first()).toBeVisible();
  });

  test("webhook endpoints can be created from the dashboard", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/integrations");

    await page.getByLabel("Endpoint name").fill("Playwright webhook");
    await page.getByLabel("Destination URL").fill("https://example.invalid/playwright-webhook");
    await page.getByRole("button", { name: "Create webhook endpoint", exact: true }).evaluate((element: HTMLButtonElement) => element.click());

    await expect(page.getByText("Copy this signing secret now.")).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "whsec_" }).first()).toBeVisible();
    await expect(page.getByText("Playwright webhook").first()).toBeVisible();
  });

  test("seeded delivery logs are visible", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard/integrations");

    await expect(page.getByText(fixtureRefs.seededWebhookName).first()).toBeVisible();
    await expect(page.getByTestId("integration-delivery-log-row").first()).toBeVisible();
    await expect(page.getByText("job.created").first()).toBeVisible();
    await expect(page.getByText("automation.rule_ran").first()).toBeVisible();
  });
});
