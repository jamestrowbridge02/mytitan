import { expect, test } from "@playwright/test";
import { fixtureRefs, loginAs } from "./utils";

const categories = [
  "Technical maturity",
  "Operational maturity",
  "Security and tenancy",
  "Platform architecture",
  "Product experience",
  "Visual polish",
  "Marketing",
];

test.describe("phase 17 excellence gate", () => {
  test("platform admin scorecard reports evidence without fake 10 out of 10 claims", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform#excellence", { waitUntil: "networkidle" });

    const scorecard = page.getByTestId("phase17-excellence-scorecard");
    await expect(scorecard).toBeVisible();
    await expect(page.getByRole("link", { name: /Excellence/i })).toBeVisible();
    await expect(scorecard).toContainText("Scores are deliberately evidence-led");

    for (const category of categories) {
      await expect(scorecard).toContainText(category);
    }

    const cards = scorecard.locator(".platform-admin-excellence-card");
    await expect(cards).toHaveCount(categories.length);
    for (let index = 0; index < categories.length; index += 1) {
      const card = cards.nth(index);
      await expect(card).toContainText("Evidence pass");
      await expect(card).toContainText("Route/file/test coverage");
      await expect(card).toContainText("Remaining weakness");
      await expect(card).toContainText("Required fix");
      await expect(card.locator(".platform-admin-excellence-card__score span").first()).not.toHaveText("10/10");
    }
  });

  test("tenant users cannot access the internal excellence scorecard", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/platform#excellence", { waitUntil: "networkidle" });

    await expect(page.getByTestId("platform-admin-forbidden")).toBeVisible();
    await expect(page.getByTestId("phase17-excellence-scorecard")).toHaveCount(0);
  });

  test("excellence scorecard remains readable on mobile without horizontal overflow", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform#excellence", { waitUntil: "networkidle" });

    await expect(page.getByTestId("phase17-excellence-scorecard")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });
});
