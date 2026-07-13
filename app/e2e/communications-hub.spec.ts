import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("communications hub", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("communications hub loads tenant-scoped threads without fake provider readiness", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/communications", { waitUntil: "networkidle" });

    await expect(page.getByTestId("communications-hub")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Communications", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Message customer" })).toBeVisible();
    await expect(page.getByTestId("communications-provider-status")).toContainText("Portal messages");
    await expect(page.getByTestId("communications-provider-status")).toContainText("WhatsApp");
    await expect(page.getByTestId("communications-provider-status")).toContainText("Setup required");
    await expect(page.getByTestId("communications-provider-status").getByText("WhatsApp").locator("..")).not.toContainText("Ready");
    await expect(page.getByTestId("communications-thread-view")).toBeVisible();
    await expect(page.getByTestId("communications-hub").getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/dashboard/settings?tab=messages");
    await expect(page.getByText(/Operational alert smoke test/i)).toHaveCount(0);
  });

  test("command palette exposes communications", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.getByPlaceholder(/search/i).fill("communications");
    await expect(page.getByRole("link", { name: /Communications/i })).toBeVisible();
  });
});
