import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { authFile, defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile });

async function selectAllLocationsIfPresent(page: Page) {
  const scopeSwitcher = page.getByTestId("location-scope-switcher");
  if (await scopeSwitcher.count()) {
    await scopeSwitcher.getByRole("combobox").selectOption({ label: "All locations" });
  }
}

async function loginAndGetToken(request: APIRequestContext, email = defaultOperatorEmail, password = defaultOperatorPassword) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

async function loginCustomerAndGetToken(request: APIRequestContext) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/customer-auth/login`, {
    data: { email: fixtureRefs.customerWorkspaceEmail, password: fixtureRefs.customerWorkspacePassword },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

async function ensureLowStockPressure(request: APIRequestContext) {
  const token = await loginAndGetToken(request);
  const levelsResponse = await requestLocalApi(request, "/inventory/stock", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(levelsResponse.ok()).toBeTruthy();
  const stockRows = await levelsResponse.json();
  const lacquerRow = Array.isArray(stockRows)
    ? stockRows.find((row: any) => row?.sku === fixtureRefs.lowStockPartSku)
    : null;
  expect(lacquerRow?.partId).toBeTruthy();
  expect(lacquerRow?.inventoryLocationId).toBeTruthy();

  const quantityOnHand = Number(lacquerRow?.quantityOnHand || 0);
  const reorderPoint = Math.max(Number(lacquerRow?.reorderPoint || 0), quantityOnHand);
  const adjustResponse = await requestLocalApi(request, "/inventory/stock/adjust", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      stockItemId: lacquerRow.partId,
      inventoryLocationId: lacquerRow.inventoryLocationId,
      quantityDelta: 0,
      reorderPoint,
      reason: "E2E low stock pressure baseline",
    },
  });
  expect(adjustResponse.ok()).toBeTruthy();
}

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
    await ensureLowStockPressure(request);
    await page.goto("/dashboard/inventory");
    await selectAllLocationsIfPresent(page);
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
    await selectAllLocationsIfPresent(page);
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
    await selectAllLocationsIfPresent(page);
    const row = page.getByTestId("purchase-order-list").locator(".integration-card", { hasText: "Seeded Supplies Ltd" }).first();
    await expect(row).toBeVisible();
    const receiveButton = row.getByRole("button", { name: "Receive" });
    if (await receiveButton.count()) {
      await receiveButton.evaluate((element: HTMLButtonElement) => element.click());
    }
    await expect(row).toContainText(/RECEIVED|PARTIALLY_RECEIVED/i);
  });

  test("truck stock transfer and technician assignment are audited", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const stockResponse = await requestLocalApi(request, "/inventory/stock", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(stockResponse.ok()).toBeTruthy();
    const rows = await stockResponse.json();
    const source = rows.find((row: any) => row.sku === fixtureRefs.reservedPartSku && row.locationName === fixtureRefs.inventoryWarehouseName);
    const target = rows.find((row: any) => row.locationName === fixtureRefs.inventoryVanName);
    expect(source?.inventoryLocationId).toBeTruthy();
    expect(target?.inventoryLocationId).toBeTruthy();

    const transfer = await requestLocalApi(request, "/inventory/stock/transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        stockItemId: source.partId,
        fromInventoryLocationId: source.inventoryLocationId,
        toInventoryLocationId: target.inventoryLocationId,
        quantity: 1,
        reason: "E2E van replenishment",
      },
    });
    expect(transfer.ok()).toBeTruthy();

    const assignments = await requestLocalApi(request, "/inventory/technician-assignments", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(assignments.ok()).toBeTruthy();
    const assignmentRows = await assignments.json();
    expect(assignmentRows.some((row: any) => row.inventoryLocation?.name === fixtureRefs.inventoryVanName)).toBeTruthy();

    const audit = await requestLocalApi(request, "/audit", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(audit.ok()).toBeTruthy();
    expect(JSON.stringify(await audit.json())).toContain("inventory.stock.transfer");
  });

  test("inventory item can become a historical quote line snapshot", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const parts = await requestLocalApi(request, `/parts?q=${encodeURIComponent(fixtureRefs.lowStockPartSku)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(parts.ok()).toBeTruthy();
    const [item] = await parts.json();
    expect(item?.id).toBeTruthy();

    const quote = await requestLocalApi(request, `/quotes/${fixtureRefs.draftQuoteId}/line-items/from-inventory`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { stockItemId: item.id, quantity: 1, unitPriceCents: 3100 },
    });
    expect(quote.ok()).toBeTruthy();
    const body = await quote.json();
    const inventoryLine = body.lineItems.find((line: any) => line.metadataJson?.inventorySnapshot?.stockItemId === item.id);
    expect(inventoryLine?.unitPriceCents).toBe(3100);
    expect(inventoryLine?.metadataJson?.inventorySnapshot?.sku).toBe(fixtureRefs.lowStockPartSku);
  });

  test("technician cannot adjust unassigned warehouse stock", async ({ request }) => {
    const techToken = await loginAndGetToken(request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    const operatorToken = await loginAndGetToken(request);
    const stockResponse = await requestLocalApi(request, "/inventory/stock", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    expect(stockResponse.ok()).toBeTruthy();
    const warehouseRow = (await stockResponse.json()).find((row: any) => row.sku === fixtureRefs.lowStockPartSku && row.locationName === fixtureRefs.inventoryWarehouseName);
    expect(warehouseRow?.inventoryLocationId).toBeTruthy();
    const denied = await requestLocalApi(request, "/inventory/stock/return", {
      method: "POST",
      headers: { Authorization: `Bearer ${techToken}`, "Content-Type": "application/json" },
      data: {
        stockItemId: warehouseRow.partId,
        inventoryLocationId: warehouseRow.inventoryLocationId,
        quantity: 1,
        reason: "E2E denied warehouse return",
      },
    });
    expect(denied.status()).toBeGreaterThanOrEqual(400);
  });

  test("internal purchase order approval and receiving stays stock-safe", async ({ request }) => {
    const operatorToken = await loginAndGetToken(request);
    const techToken = await loginAndGetToken(request, fixtureRefs.technicianEmail, fixtureRefs.technicianPassword);
    const customerToken = await loginCustomerAndGetToken(request);

    const stockResponse = await requestLocalApi(request, "/inventory/stock", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    expect(stockResponse.ok()).toBeTruthy();
    const stockRows = await stockResponse.json();
    const lowStock = stockRows.find((row: any) => row.sku === fixtureRefs.lowStockPartSku && row.locationName === fixtureRefs.inventoryWarehouseName);
    expect(lowStock?.partId).toBeTruthy();
    expect(lowStock?.inventoryLocationId).toBeTruthy();
    const beforeQty = Number(lowStock.quantityOnHand || 0);

    const draftResponse = await requestLocalApi(request, `/inventory/items/${lowStock.partId}/reorder-draft`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
      data: { qtyOrdered: 3, locationId: lowStock.inventoryLocationId },
    });
    expect(draftResponse.ok()).toBeTruthy();
    const draft = await draftResponse.json();
    expect(draft.status).toBe("DRAFT");
    expect(draft.lines?.[0]?.quantityReceived).toBe(0);
    expect(draft.lines?.[0]?.pricingSnapshotJson?.internalPoOnly).toBeTruthy();

    const stockAfterDraft = await requestLocalApi(request, "/inventory/stock", { headers: { Authorization: `Bearer ${operatorToken}` } });
    const afterDraftRows = await stockAfterDraft.json();
    const afterDraft = afterDraftRows.find((row: any) => row.partId === lowStock.partId && row.inventoryLocationId === lowStock.inventoryLocationId);
    expect(Number(afterDraft.quantityOnHand || 0)).toBe(beforeQty);

    const submitted = await requestLocalApi(request, `/purchase-orders/${draft.id}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
      data: { note: "E2E internal submit" },
    });
    expect(submitted.ok()).toBeTruthy();
    expect((await submitted.json()).status).toBe("SUBMITTED_INTERNAL");

    const technicianApprove = await requestLocalApi(request, `/purchase-orders/${draft.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${techToken}`, "Content-Type": "application/json" },
      data: {},
    });
    expect(technicianApprove.status()).toBeGreaterThanOrEqual(400);

    const approved = await requestLocalApi(request, `/purchase-orders/${draft.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
      data: { note: "E2E approved internal PO" },
    });
    expect(approved.ok()).toBeTruthy();
    const approvedBody = await approved.json();
    expect(approvedBody.status).toBe("APPROVED");

    const lineId = approvedBody.lines?.[0]?.id;
    expect(lineId).toBeTruthy();
    const partial = await requestLocalApi(request, `/purchase-orders/${draft.id}/receive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
      data: { lines: [{ lineId, quantityReceived: 1 }] },
    });
    expect(partial.ok()).toBeTruthy();
    expect((await partial.json()).status).toBe("PARTIALLY_RECEIVED");

    const full = await requestLocalApi(request, `/purchase-orders/${draft.id}/receive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
      data: {},
    });
    expect(full.ok()).toBeTruthy();
    expect((await full.json()).status).toBe("RECEIVED");

    const doubleReceive = await requestLocalApi(request, `/purchase-orders/${draft.id}/receive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}`, "Content-Type": "application/json" },
      data: {},
    });
    expect(doubleReceive.status()).toBeGreaterThanOrEqual(400);

    const customerList = await requestLocalApi(request, "/purchase-orders", {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(customerList.status()).toBeGreaterThanOrEqual(400);

    const bridge = await requestLocalApi(request, "/inventory/supplier-bridge/readiness", {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });
    expect(bridge.ok()).toBeTruthy();
    const bridgeBody = await bridge.json();
    expect(bridgeBody.liveSupplierOrdering).toBeFalsy();
    expect(bridgeBody.provider?.exposesSecrets).toBeFalsy();
    expect(bridgeBody.credentialsExposed).toBeFalsy();
    expect(JSON.stringify(bridgeBody)).not.toMatch(/token|apiKey|privateUrl|password/i);
  });

  test("job material shortage can create an internal purchase order draft", async ({ request }) => {
    const token = await loginAndGetToken(request);
    const stockResponse = await requestLocalApi(request, "/inventory/stock", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(stockResponse.ok()).toBeTruthy();
    const stockRows = await stockResponse.json();
    const lowStock = stockRows.find((row: any) => row.sku === fixtureRefs.lowStockPartSku && row.locationName === fixtureRefs.inventoryWarehouseName);
    expect(lowStock?.partId).toBeTruthy();

    const jobPart = await requestLocalApi(request, `/jobs/${fixtureRefs.technicianJobId}/parts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        stockItemId: lowStock.partId,
        quantityPlanned: 9999,
        sourceLocationId: lowStock.inventoryLocationId,
        unitCostCents: 1200,
        unitPriceCents: 2600,
      },
    });
    expect(jobPart.ok()).toBeTruthy();

    const draft = await requestLocalApi(request, "/purchase-orders/from-job-need", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {
        jobId: fixtureRefs.technicianJobId,
        inventoryLocationId: lowStock.inventoryLocationId,
        supplierName: "Internal Job Need Supplier",
      },
    });
    expect(draft.ok()).toBeTruthy();
    const body = await draft.json();
    expect(body.status).toBe("DRAFT");
    expect(body.lines.some((line: any) => line.sourceJobId === fixtureRefs.technicianJobId)).toBeTruthy();
    expect(body.supplierName).toBe("Internal Job Need Supplier");
  });
});
