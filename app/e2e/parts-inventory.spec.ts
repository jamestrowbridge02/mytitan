import { expect, test } from "@playwright/test";
import { authFile, fixtureRefs, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

test.describe("parts and inventory", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated inventory tests.");

  test("parts catalog renders seeded parts", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/parts");
    await expect(page.getByRole("heading", { name: "Parts", exact: true })).toBeVisible();
    await expect(page.getByTestId("part-list")).toContainText(fixtureRefs.lowStockPartSku);
    await expect(page.getByTestId("part-list")).toContainText(fixtureRefs.reservedPartSku);
  });

  test("inventory grid renders low-stock pressure", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/inventory");
    await expect(page.getByTestId("inventory-stock-grid")).toContainText(fixtureRefs.lowStockPartName);
    await expect(page.getByTestId("inventory-stock-grid")).toContainText(/Low stock/i);
    await expect(page.getByTestId("inventory-stock-grid")).toContainText(/Shortage pressure/i);
  });

  test("job parts panel renders on job detail", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/dashboard/jobs/${fixtureRefs.portalActiveJobId || "e2e-job-portal-active"}`);
    await expect(page.getByTestId("job-parts-list")).toContainText(fixtureRefs.reservedPartSku);
    await expect(page.getByTestId("job-parts-list")).toContainText(/Reserved/i);
  });

  test("intelligence surfaces inventory pressure", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/intelligence");
    await expect(page.getByText(/Low-stock parts/i).first()).toBeVisible();
    await expect(page.getByText(/Open purchase orders/i).first()).toBeVisible();
  });

  test("planned job part can be reserved and used", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/dashboard/jobs/${fixtureRefs.technicianJobId || "e2e-job-technician"}`);
    const row = page.getByTestId("job-parts-list").locator(".integration-card", { hasText: fixtureRefs.plannedPartSku }).first();
    await expect(row).toBeVisible();
    await row.getByTestId("job-part-reserve").evaluate((element: HTMLButtonElement) => element.click());
    await expect(row).toContainText(/Reserved/i);
    await row.getByTestId("job-part-use").evaluate((element: HTMLButtonElement) => element.click());
    await expect(row).toContainText(/Used/i);
  });

  test("purchase order create flow works", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/purchase-orders");
    const scopeSwitcher = page.getByTestId("location-scope-switcher");
    if (await scopeSwitcher.count()) {
      await scopeSwitcher.getByRole("combobox").selectOption({ label: "All locations" });
    }
    await page.getByTestId("purchase-order-supplier").fill("Playwright Supplier");
    await page.getByTestId("purchase-order-location").selectOption({ label: fixtureRefs.inventoryWarehouseName });
    await page.getByTestId("purchase-order-part").selectOption({ label: `${fixtureRefs.lowStockPartSku} · ${fixtureRefs.lowStockPartName}` });
    await page.getByTestId("purchase-order-qty").fill("4");
    await page.getByTestId("purchase-order-save").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByTestId("purchase-order-list")).toContainText("Playwright Supplier");
  });

  test("purchase order receive flow works", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/purchase-orders");
    const scopeSwitcher = page.getByTestId("location-scope-switcher");
    if (await scopeSwitcher.count()) {
      await scopeSwitcher.getByRole("combobox").selectOption({ label: "All locations" });
    }
    const row = page.getByTestId("purchase-order-list").locator(".integration-card", { hasText: "Seeded Supplies Ltd" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Receive" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(row).toContainText(/RECEIVED|PARTIALLY_RECEIVED/i);
  });
});
