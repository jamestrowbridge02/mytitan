import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe("multi-location operations", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated location tests.");

  test("locations page renders seeded business locations and scope switcher", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/locations");
    await expect(page.getByTestId("location-list")).toContainText(fixtureRefs.hqLocationName);
    await expect(page.getByTestId("location-list")).toContainText(fixtureRefs.northLocationName);
    await expect(page.getByTestId("location-scope-switcher")).toBeVisible();
  });

  test("operator can create and edit a business location", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/locations");
    const createCard = page.getByTestId("location-create");
    const suffix = Date.now().toString().slice(-6);
    const code = `S${suffix}`;
    const name = `E2E South Branch ${suffix}`;
    const updatedName = `${name} Updated`;
    const postcode = `PO${suffix.slice(0, 2)} ${suffix.slice(2, 5)}`;
    await createCard.getByTestId("location-code-input").fill(code);
    await createCard.getByTestId("location-name-input").fill(name);
    await createCard.getByTestId("location-address-line-1").fill("12 Test Street");
    await createCard.getByTestId("location-address-line-2").fill("Workshop 3");
    await createCard.getByTestId("location-city").fill("Chichester");
    await createCard.getByTestId("location-region").fill("West Sussex");
    await createCard.getByTestId("location-postcode").fill(postcode);
    await expect(createCard.getByTestId("location-save-state")).toContainText("Unsaved changes");
    await page.getByTestId("location-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("location-list")).toContainText(name);
    await expect(page.getByTestId("location-list")).toContainText(postcode);

    const row = page.getByTestId("location-list").locator(".integration-card", { hasText: name }).first();
    await row.getByRole("button", { name: "Edit" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(createCard.getByTestId("location-save-state")).toContainText("Saved");
    await createCard.getByTestId("location-image-input").setInputFiles({
      name: "location.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
    await expect(createCard.getByTestId("location-image-selection")).toContainText("location.png");
    await expect(createCard.getByTestId("location-image-preview")).toBeVisible();
    await createCard.getByTestId("location-image-upload").click();
    await expect(createCard.getByTestId("location-image-preview")).toBeVisible();
    await expect(page.getByText("Location image updated for public booking.")).toBeVisible();
    await createCard.getByTestId("location-name-input").fill(updatedName);
    await page.getByTestId("location-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("location-list")).toContainText(updatedName);
  });

  test("operator can assign a location membership", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/locations");
    const memberships = page.getByTestId("location-membership-list");
    await memberships.getByRole("combobox").nth(0).selectOption({ label: fixtureRefs.viewerEmail });
    await memberships.getByRole("combobox").nth(1).selectOption({ label: fixtureRefs.northLocationName });
    await memberships.getByRole("button", { name: "Assign membership" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(memberships).toContainText(fixtureRefs.viewerEmail);
    await expect(memberships).toContainText(fixtureRefs.northLocationName);
  });

  test("location scope filters the jobs workspace", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/jobs");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: `${fixtureRefs.northLocationName} (NORTH)` });
    await expect(page.getByText("E2E-OPEN-001").first()).toBeVisible();
    await expect(page.getByText("E2E-PORTAL-ACTIVE-001").first()).toHaveCount(0);
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: `${fixtureRefs.hqLocationName} (HQ)` });
  });

  test("location scope filters analytics and shows location-aware note", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/analytics");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: `${fixtureRefs.northLocationName} (NORTH)` });
    await expect(page.getByText(/This view is filtered to the active business location/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operational view" })).toBeVisible();
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
  });

  test("inventory workspace stays scoped to the active business location", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/inventory");
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: `${fixtureRefs.northLocationName} (NORTH)` });
    await expect(page.getByTestId("inventory-stock-grid")).toContainText(fixtureRefs.inventoryVanName);
    await expect(page.getByTestId("inventory-stock-grid")).not.toContainText(fixtureRefs.inventoryWarehouseName);
    await page.getByTestId("location-scope-switcher").locator("select").selectOption({ label: "All locations" });
  });
});
