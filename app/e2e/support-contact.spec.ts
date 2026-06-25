import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.describe("support and contact flows", () => {
  test("marketing contact page routes through a real form with validation", async ({ page }) => {
    const response = await page.goto("http://127.0.0.1:3002/contact", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /get real help through the mytitan support path/i })).toBeVisible();
    const submit = page.getByRole("button", { name: /send to mytitan/i });
    await expect(submit).toBeDisabled();

    await page.getByLabel("Name").fill("Alex Operator");
    await page.getByLabel("Email").fill("alex@example.com");
    await page.getByLabel("Subject").fill("Need onboarding help");
    await page.getByLabel("Message").fill("Please help me understand the best setup path for our workspace and booking rollout.");
    await expect(submit).toBeEnabled();
  });
});

test.describe("dashboard support flow", () => {
  test.use({ storageState: authFile });
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("help and settings keep direct MyTitan support entry points out of the normal dashboard", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-support-card")).toHaveCount(0);

    await page.goto("/dashboard/help");
    const supportCard = page.getByTestId("dashboard-support-card");
    await expect(supportCard).toBeVisible();
    await expect(supportCard).toContainText("Help when you need it");
    await supportCard.getByRole("link", { name: /share idea/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/help\?category=feature_request$/);
    await expect(page.getByRole("heading", { name: /contact mytitan support/i })).toBeVisible();
  });

  test("dashboard help form validates and keeps the route real", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/help");
    await expect(page.getByTestId("dashboard-help-form")).toBeVisible();
    await expect(page.getByTestId("dashboard-help-submit")).toBeDisabled();
    await page.getByLabel("Subject").fill("Integration setup question");
    await page.getByLabel("Message").fill("Please help us confirm the safest rollout path for user-scoped integrations and support routing.");
    await page.getByLabel("Callback email").fill("operator@example.com");
    await expect(page.getByTestId("dashboard-help-submit")).toBeEnabled();
  });
});
