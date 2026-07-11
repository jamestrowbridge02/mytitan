import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

const PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sQ8V6sAAAAASUVORK5CYII=";
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL || "https://app.mytitan.co.uk";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL || "https://api.mytitan.co.uk";

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return String(token || "");
}

async function getTenantSettings(request: any, token: string) {
  const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getCurrentUser(request: any, token: string) {
  const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function updateTenantSettings(request: any, token: string, data: Record<string, unknown>) {
  const response = await request.put(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function listServiceRecordDispatchAudits(request: any, token: string) {
  const response = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/audit?type=notification.service_record_email.dispatch&pageSize=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return Array.isArray(body?.items) ? body.items : [];
}

test.describe("job sheet authority and settings IA", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("settings page resolves legacy workflow links into grouped product sections", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=workflow");

    await expect(page.locator("h1", { hasText: "Settings" })).toBeVisible();
    await expect(page.getByTestId("settings-tab-jobs")).toBeVisible();
    await expect(page.getByTestId("settings-tab-output")).toBeVisible();
    await expect(page.getByTestId("settings-tab-messages")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings directory", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Setup", exact: true })).toBeVisible();
    await expect(page.locator("h1", { hasText: "Settings" })).toBeVisible();
    await page.getByTestId("settings-tab-general").click();
    await expect(page.getByRole("heading", { name: "Dashboard & analytics layout", exact: true })).toBeVisible();
    await page.getByTestId("settings-tab-jobs").click();
    await expect(page.getByText("Job declaration")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings directory", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Keep changes in one place: payments in Billing/i);
  });

  test("legacy customer settings alias resolves to the single job output home", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=customers");

    await expect(page.getByTestId("settings-tab-output")).toHaveClass(/active/);
    await expect(page.getByText("Job output ownership")).toBeVisible();
    await expect(page.getByText("Service record delivery")).toBeVisible();
  });

  test("customer-safe service record emails exclude protected sections by default", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const uniqueId = Date.now();
    const currentSettings = await getTenantSettings(request, token);
    try {
      await updateTenantSettings(request, token, {
        businessConfigJson: {
          ...(currentSettings?.businessConfigJson || {}),
          serviceRecordEmail: {
            defaultRecipients: [`service-safe-${uniqueId}@example.test`],
            includeJobCustomerEmail: true,
          },
        },
      });

      const createResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/jobs`, {
        headers,
        data: {
          customerName: `Safe Output ${uniqueId}`,
          customerEmail: `safe-output-${uniqueId}@example.test`,
          customerPhone: "01133002211",
          serviceName: "Safe Output Job",
          tradeCode: "WHEELS",
          jobType: "Trade",
          completeAfterCreate: true,
          formData: {
            jobReference: `E2E-SAFE-${uniqueId}`,
            jobDate: "2026-03-27",
            jobType: "Trade",
            serviceName: "Safe Output Job",
            customerName: `Safe Output ${uniqueId}`,
            customerEmail: `safe-output-${uniqueId}@example.test`,
            customerPhone: "01133002211",
            technicianName: "Playwright Technician",
            technicianSignatureName: "Playwright Technician",
            technicianSignature: PIXEL_DATA_URL,
            customerSignatureName: "Playwright Customer",
            customerSignature: PIXEL_DATA_URL,
            billingContactName: "Accounts Team",
            billingEmail: `billing-safe-${uniqueId}@example.test`,
            billingPhone: "01133005566",
            notes: "Internal worksheet note",
          },
        },
      });
      expect(createResponse.ok()).toBeTruthy();
      const createdJob = await createResponse.json();
      expect(String(createdJob?.pdf?.portalUrl || "")).toMatch(new RegExp(`^${appBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/portal/job/`));
      expect(String(createdJob?.pdf?.pdfUrl || "")).toMatch(new RegExp(`^${apiBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/public/job/`));

      const afterDispatchAudits = await listServiceRecordDispatchAudits(request, token);
      const latestDispatch = afterDispatchAudits[0];
      expect(latestDispatch).toBeTruthy();
      const message = String(latestDispatch?.message || "");
      expect(message).toContain("recipient_count=");
      expect(message).toContain("sections=");
      expect(message).not.toContain("billing_details");
      expect(message).toContain("footer=disabled");
      expect(message).not.toContain("@example.test");

      const pdfResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}${createdJob.pdf.url}`);
      expect(pdfResponse.ok()).toBeTruthy();
      const pdfText = (await pdfResponse.body()).toString("utf8");
      expect(pdfText).not.toContain("BILLING DETAILS");
      expect(pdfText).not.toContain("Accounts Team");
      expect(pdfText).not.toContain("Internal worksheet note");
    } finally {
      await updateTenantSettings(request, token, {
        businessConfigJson: currentSettings?.businessConfigJson || {},
      });
    }
  });

  test("submitted job sheet drives PDF, stock usage, completion, and configured email attempts from one saved job record", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const uniqueId = Date.now();
    const currentSettings = await getTenantSettings(request, token);
    try {
      await updateTenantSettings(request, token, {
        businessConfigJson: {
          ...(currentSettings?.businessConfigJson || {}),
          serviceRecordEmail: {
            defaultRecipients: [
              `jobsheet-audit-${uniqueId}@example.test`,
              `jobsheet-audit-${uniqueId}@example.test`,
            ],
            includeJobCustomerEmail: true,
            includeBusinessDetails: true,
            includeContactDetails: true,
            includeBillingDetails: true,
            includePaymentSummary: true,
            includeEvidenceSummary: true,
            includeSignatureSummary: true,
            includePortalLink: true,
            includePdfLink: true,
            signatureEnabled: true,
            signatureText: "Thanks for choosing MyTitan.\nCustomer Care Team",
          },
        },
      });

      const stockLevelsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/inventory/levels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(stockLevelsResponse.ok()).toBeTruthy();
      const stockLevels = await stockLevelsResponse.json();
      const stockedItem = Array.isArray(stockLevels)
        ? stockLevels.find((item: any) => Number(item?.currentLevel || 0) >= 1 && item?.item?.id)
        : null;
      expect(stockedItem?.item?.id).toBeTruthy();

      const createResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/jobs`, {
        headers,
        data: {
          customerName: `Playwright Job Sheet ${uniqueId}`,
          customerEmail: `jobsheet-${uniqueId}@example.test`,
          customerPhone: "01133009900",
          serviceName: "Playwright Authority Job",
          tradeCode: "WHEELS",
          jobType: "Trade",
          completeAfterCreate: true,
          partAllocations: [
            {
              stockItemId: stockedItem.item.id,
              quantity: 1,
              locationId: stockedItem.inventoryLocationId || undefined,
              reason: "Playwright authoritative job-sheet submission",
            },
          ],
          beforeMedia: [{ data: PIXEL_DATA_URL, filename: "before.png", mimeType: "image/png" }],
          afterMedia: [{ data: PIXEL_DATA_URL, filename: "after.png", mimeType: "image/png" }],
          torqueEvidenceMedia: { data: PIXEL_DATA_URL, filename: "torque.png", mimeType: "image/png" },
          formData: {
            jobReference: `E2E-AUTH-${uniqueId}`,
            jobDate: "2026-03-27",
            jobType: "Trade",
            siteLocation: "Unit 4, Riverside Depot",
            serviceName: "Playwright Authority Job",
            customerName: `Playwright Job Sheet ${uniqueId}`,
            customerEmail: `jobsheet-${uniqueId}@example.test`,
            customerPhone: "01133009900",
            technicianName: "Playwright Technician",
            technicianSignatureName: "Playwright Technician",
            technicianSignature: PIXEL_DATA_URL,
            customerSignatureName: "Playwright Customer",
            customerSignature: PIXEL_DATA_URL,
            vehicleColour: "Silver",
            wheel_nsf: true,
            wheel_osf: true,
            wheelCount: 4,
            quantity: 1,
            serviceQuantity: 1,
            unitPrice: 125,
            pricePerWheel: 125,
            additionalServicesText: "Locking wheel nut removal",
            additionalServicePrice: 15,
            vatEnabled: true,
            vatRate: 20,
            notes: "Internal worksheet note",
            internalNotes: "Operator-only note",
            billingContactName: "Accounts Payable",
            billingEmail: `billing-${uniqueId}@example.test`,
            billingPhone: "01133008877",
          },
        },
      });
      expect(createResponse.ok()).toBeTruthy();
      const createdJob = await createResponse.json();
      expect(String(createdJob?.pdf?.portalUrl || "")).toMatch(new RegExp(`^${appBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/portal/job/`));
      expect(String(createdJob?.pdf?.pdfUrl || "")).toMatch(new RegExp(`^${apiBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/public/job/`));

      expect(createdJob?.status).toBe("COMPLETED");
      expect(Array.isArray(createdJob?.submissionWarnings)).toBeTruthy();
      expect(createdJob?.submissionWarnings || []).toEqual([]);
      expect(createdJob?.pdf?.url || createdJob?.pdf?.pdfUrl).toBeTruthy();
      expect(String(createdJob?.pdf?.portalUrl || "")).toContain("/portal/job/");
      expect(Array.isArray(createdJob?.partAllocations)).toBeTruthy();
      expect(createdJob.partAllocations).toHaveLength(1);

      const jobDetailResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/jobs/${createdJob.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(jobDetailResponse.ok()).toBeTruthy();
      const jobDetail = await jobDetailResponse.json();
      expect(jobDetail?.customerName).toBe(`Playwright Job Sheet ${uniqueId}`);
      expect(jobDetail?.status).toBe("COMPLETED");
      expect(jobDetail?.formData?.jobReference).toBe(`E2E-AUTH-${uniqueId}`);
      expect(jobDetail?.formData?.siteLocation).toBe("Unit 4, Riverside Depot");
      expect(jobDetail?.formData?.vehicleColour).toBe("Silver");
      expect(jobDetail?.formData?.wheelPositions).toEqual(expect.arrayContaining(["NSF", "OSF"]));
      expect(jobDetail?.formData?.serviceTypes).toEqual(expect.arrayContaining(["Playwright Authority Job"]));
      expect(Number(jobDetail?.formData?.additionalServicePrice || 0)).toBe(15);
      expect(Number(jobDetail?.formData?.totalPrice || 0)).toBeGreaterThan(0);
      expect(String(jobDetail?.whatsappCompletionLink || "")).toContain("/portal/job/");
      expect(Array.isArray(jobDetail?.assets)).toBeTruthy();
      expect(jobDetail.assets.length).toBeGreaterThanOrEqual(5);

      const pdfResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}${createdJob.pdf.url}`);
      expect(pdfResponse.ok()).toBeTruthy();
      const pdfText = (await pdfResponse.body()).toString("utf8");
      expect(pdfText).toContain("COMPLETION SUMMARY");
      expect(pdfText).toContain("Customer portal:");
      expect(pdfText).toContain("Service record PDF:");
      expect(pdfText).toContain("Site location: Unit 4, Riverside Depot");
      expect(pdfText).toContain("Additional services: Locking wheel nut removal");
      expect(pdfText).toContain("Vehicle colour: Silver");

      const jobPartsResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/jobs/${createdJob.id}/parts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(jobPartsResponse.ok()).toBeTruthy();
      const jobParts = await jobPartsResponse.json();
      expect(Array.isArray(jobParts)).toBeTruthy();
      expect(jobParts).toHaveLength(1);
      expect(jobParts[0]?.partId).toBe(stockedItem.item.id);
      expect(Number(jobParts[0]?.quantityUsed || 0)).toBeGreaterThanOrEqual(1);
      expect(jobParts[0]?.status).toBe("USED");

      const afterDispatchAudits = await listServiceRecordDispatchAudits(request, token);
      const latestDispatch = afterDispatchAudits[0];
      expect(latestDispatch).toBeTruthy();
      expect(String(latestDispatch?.message || "")).toContain("sections=");
      expect(String(latestDispatch?.message || "")).toContain("billing_details");
      expect(String(latestDispatch?.message || "")).toContain("footer=enabled");
      expect(String(latestDispatch?.message || "")).not.toContain("@example.test");
      expect(pdfText).toContain("BILLING DETAILS");
      expect(pdfText).toContain("Accounts Payable");
      expect(pdfText).not.toContain("Internal worksheet note");
    } finally {
      await updateTenantSettings(request, token, {
        businessConfigJson: currentSettings?.businessConfigJson || {},
      });
    }
  });

  test("owners can add, remove, save, and reload service record email settings", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=output");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);

    try {
      await page.getByTestId("service-record-recipient-input").fill("ops-team@example.test");
      await page.getByTestId("service-record-recipient-add").click();
      await page.getByTestId("service-record-recipient-input").fill("ops-team@example.test");
      await page.getByTestId("service-record-recipient-add").click();
      await page.getByTestId("service-record-recipient-input").fill("accounts@example.test");
      await page.getByTestId("service-record-recipient-add").click();
      await page.getByTestId("service-record-recipient-remove-accounts@example.test").click();

      await page.getByLabel("Append email signature / footer").check();
      await page.getByTestId("service-record-signature-input").fill("Kind regards,\nMyTitan Service Desk");
      await page.getByTestId("settings-save-button").click();
      await expect(page.getByTestId("operator-notice-success")).toContainText(/Settings saved/i);

      await page.reload();
      await page.goto("/dashboard/settings?tab=output");
      await expect(page.getByTestId("service-record-recipient-list")).toContainText("ops-team@example.test");
      await expect(page.getByTestId("service-record-recipient-list")).not.toContainText("accounts@example.test");
      await expect(page.getByTestId("service-record-signature-input")).toHaveValue("Kind regards,\nMyTitan Service Desk");
      await expect(page.getByLabel("Append email signature / footer")).toBeChecked();
    } finally {
      await updateTenantSettings(request, token, {
        businessConfigJson: currentSettings?.businessConfigJson || {},
      });
    }
  });

  test("service record communication uses operator reply-to while keeping workspace delivery ownership", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard");
    const token = await getToken(page);
    const me = await getCurrentUser(request, token);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const uniqueId = Date.now();
    const currentSettings = await getTenantSettings(request, token);
    try {
      await updateTenantSettings(request, token, {
        businessConfigJson: {
          ...(currentSettings?.businessConfigJson || {}),
          serviceRecordEmail: {
            defaultRecipients: [`operator-replyto-${uniqueId}@example.test`],
            includeJobCustomerEmail: false,
          },
        },
      });

      const createResponse = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/jobs`, {
        headers,
        data: {
          customerName: `Operator Mail ${uniqueId}`,
          customerEmail: `operator-mail-${uniqueId}@example.test`,
          serviceName: "Operator Mail Job",
          tradeCode: "WHEELS",
          jobType: "Trade",
          completeAfterCreate: true,
          formData: {
            jobReference: `E2E-OPMAIL-${uniqueId}`,
            jobDate: "2026-03-27",
            customerName: `Operator Mail ${uniqueId}`,
            customerEmail: `operator-mail-${uniqueId}@example.test`,
            serviceName: "Operator Mail Job",
            technicianName: "Playwright Technician",
          },
        },
      });
      expect(createResponse.ok()).toBeTruthy();
      await createResponse.json();

      const afterDispatchAudits = await listServiceRecordDispatchAudits(request, token);
      const latestDispatch = afterDispatchAudits[0];
      expect(latestDispatch).toBeTruthy();
      const message = String(latestDispatch?.message || "");
      expect(message).toContain("recipient_count=");
      expect(message).toContain("sections=");
      expect(message).not.toContain("@example.test");
    } finally {
      await updateTenantSettings(request, token, {
        businessConfigJson: currentSettings?.businessConfigJson || {},
      });
    }
  });
});
