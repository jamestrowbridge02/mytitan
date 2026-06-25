import { expect, test } from "@playwright/test";
import { fixtureRefs, loginAs } from "./utils";

test.describe("phase 16 product excellence", () => {
  test("enterprise readiness roadmap separates live evidence from roadmap items", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });

    const roadmap = page.getByTestId("phase16-enterprise-readiness-roadmap");
    await expect(roadmap).toBeVisible();
    for (const item of ["SSO", "SCIM provisioning", "Audit exports", "Retention controls", "API and scoped tokens", "Rate limits", "Webhook replay", "Marketplace and partners"]) {
      await expect(roadmap).toContainText(item);
    }
    await expect(roadmap).toContainText("Roadmap items are intentionally not presented as live");
    await expect(page.getByTestId("phase16-roadmap-sso")).toContainText("Roadmap");
    await expect(page.getByTestId("phase16-roadmap-scim")).toContainText("Roadmap");
    await expect(page.getByTestId("phase16-roadmap-audit_exports")).toContainText("Available evidence");
    await expect(roadmap).not.toContainText(/SSO live|SCIM live|marketplace live|partner ecosystem live/i);
  });

  test("pricing FAQ answers commercial boundaries without fake readiness", async ({ page }) => {
    await page.goto("http://127.0.0.1:3002/pricing", { waitUntil: "networkidle" });

    const faq = page.getByTestId("pricing-truthful-faq");
    await expect(faq).toBeVisible();
    await expect(faq).toContainText("Clear answers before checkout.");
    await expect(faq).toContainText("Customer money stays on the business payment setup");
    await expect(faq).toContainText("Packs are only sold when Stripe products, webhook-backed granting, and readiness checks are configured");
    await expect(faq).toContainText("Annual billing changes the subscription interval only");
    await expect(page.locator("body")).not.toContainText(/instant live payments|guaranteed revenue|trusted by \d+|99\.9% uptime/i);
  });

  test("enterprise and pricing excellence surfaces remain mobile safe", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase16-enterprise-readiness-roadmap")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();

    await page.goto("http://127.0.0.1:3002/pricing", { waitUntil: "networkidle" });
    await expect(page.getByTestId("pricing-truthful-faq")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });
});
