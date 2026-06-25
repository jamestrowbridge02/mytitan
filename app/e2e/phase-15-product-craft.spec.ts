import { expect, test } from "@playwright/test";
import { fixtureRefs, loginAs } from "./utils";

test.describe("phase 15 product craftsmanship", () => {
  test("marketing homepage presents truthful launch proof without fake enterprise claims", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });

    const proof = page.getByRole("region", { name: "Launch proof and readiness" });
    await expect(proof).toBeVisible();
    await expect(proof).toContainText("Premium should also mean honest.");
    await expect(proof).toContainText("Tenant-owned");
    await expect(proof).toContainText("Provider readiness");
    await expect(proof).toContainText("Evidence-led");
    await expect(proof.getByRole("link", { name: "Review controls" })).toHaveAttribute("href", "/security");
    await expect(proof.getByRole("link", { name: "Ask about launch checks" })).toHaveAttribute("href", "/contact");
    await expect(page.locator("body")).not.toContainText(/99\.9% uptime|award-winning|trusted by \d+|guaranteed revenue|instant live payments/i);
  });

  test("Tenant 360 commercial action panel shows a guided platform-only decision flow", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform/tenants/e2e-company", { waitUntil: "networkidle" });

    const panel = page.getByTestId("tenant-360-commercial-action-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Current state");
    await expect(panel).toContainText("Proposed change");
    await expect(panel).toContainText("Audit trail");
    await expect(panel).toContainText("never mutates Stripe products or prices");
    await expect(page.getByTestId("tenant-360-commercial-save")).toBeDisabled();
    await expect(page.getByTestId("tenant-360-commercial-tab-link")).toHaveAttribute("href", "#commercial");
  });

  test("core polished surfaces remain readable without horizontal overflow on mobile", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    for (const path of ["/dashboard", "/dashboard/jobs", "/dashboard/settings/launch-control", "/platform/autopilot"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    }

    await page.goto("http://127.0.0.1:3002/", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });
});
