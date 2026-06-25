import { expect, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs } from "./utils";

async function operatorToken(request: any) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    data: {
      email: "e2e.operator@mytitan.local",
      password: "MyTitanE2E!2026",
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return String(body?.token || "");
}

async function createTradeAccount(request: any, token: string, suffix: string) {
  const response = await request.post("http://127.0.0.1:3000/trade-accounts", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      name: `E2E Consistency Fleet ${suffix}`,
      contactName: "Jordan Lead",
      contactEmail: `ops.${suffix}@consistency.test`,
      contactPhone: "01133000000",
      contactMobile: "07700900123",
      secondaryContactName: "Riley Backup",
      secondaryContactEmail: `backup.${suffix}@consistency.test`,
      secondaryContactPhone: "01133000001",
      secondaryContactMobile: "07700900124",
      vatNumber: `GB-VAT-${suffix}`,
      companyNumber: `COMP-${suffix}`,
      businessAddressLine1: "1 Trade Estate",
      businessAddressLine2: "Unit 4",
      businessCity: "Leeds",
      businessPostcode: "LS1 1AA",
      businessCountry: "United Kingdom",
      billingContactName: "Accounts Team",
      billingEmail: `accounts.${suffix}@consistency.test`,
      billingPhone: "01133000002",
      billingMobile: "07700900125",
      billingAddressLine1: "PO Box 10",
      billingAddressLine2: "Dock Street",
      billingCity: "Bradford",
      billingPostcode: "BD1 1BB",
      billingCountry: "United Kingdom",
      creditLimit: 0,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function patchTradeAccountCrm(request: any, token: string, accountId: string, data: Record<string, unknown>) {
  const response = await request.patch(`http://127.0.0.1:3000/crm/accounts/${accountId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function createJob(request: any, token: string, tradeAccountId: string, suffix: string, sparse = false) {
  const signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXS0AAAAASUVORK5CYII=";
  const fullFormData = {
    jobReference: `E2E-FIELDS-${suffix}`,
    jobDate: "2026-03-24",
    completedDate: "2026-03-24",
    jobType: "Wheel Repair",
    customerTradeName: `E2E Consistency Fleet ${suffix}`,
    tradeName: `E2E Consistency Fleet ${suffix}`,
    tradeContactName: "Jordan Lead",
    customerEmail: `ops.${suffix}@consistency.test`,
    customerPhone: "01133000000",
    contactMobile: "07700900123",
    vatNumber: `GB-VAT-${suffix}`,
    companyNumber: `COMP-${suffix}`,
    addressLine1: "1 Trade Estate",
    addressLine2: "Unit 4",
    town: "Leeds",
    postcode: "LS1 1AA",
    country: "United Kingdom",
    billingContactName: "Accounts Team",
    billingEmail: `accounts.${suffix}@consistency.test`,
    billingPhone: "01133000002",
    billingMobile: "07700900125",
    billingAddressLine1: "PO Box 10",
    billingAddressLine2: "Dock Street",
    billingCity: "Bradford",
    billingPostcode: "BD1 1BB",
    billingCountry: "United Kingdom",
    secondaryContactName: "Riley Backup",
    secondaryContactEmail: `backup.${suffix}@consistency.test`,
    secondaryContactPhone: "01133000001",
    secondaryContactMobile: "07700900124",
    technicianName: "E2E Tech",
    technicianSignatureName: "E2E Tech",
    technicianSignature: signature,
    customerSignatureName: "Jordan Lead",
    customerSignature: signature,
  };
  const sparseFormData = {
    jobReference: `E2E-FIELDS-SPARSE-${suffix}`,
    jobDate: "2026-03-24",
    completedDate: "2026-03-24",
    jobType: "Wheel Repair",
    customerTradeName: `E2E Sparse Fleet ${suffix}`,
    technicianName: "E2E Tech",
    technicianSignatureName: "E2E Tech",
    technicianSignature: signature,
    customerSignatureName: "Jordan Lead",
    customerSignature: signature,
  };

  const response = await request.post("http://127.0.0.1:3000/jobs", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      customerName: sparse ? `E2E Sparse Fleet ${suffix}` : `E2E Consistency Fleet ${suffix}`,
      customerEmail: sparse ? undefined : `ops.${suffix}@consistency.test`,
      customerPhone: sparse ? undefined : "01133000000",
      serviceName: "Wheel Repair",
      tradeCode: "WHEELS",
      jobType: "Wheel Repair",
      tradeAccountId,
      laborCents: 12500,
      taxRateBps: 2000,
      formData: sparse ? sparseFormData : fullFormData,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function extractPortalToken(pdfUrl: string) {
  const match = pdfUrl.match(/\/public\/job\/([^/]+)\/pdf/);
  expect(match).toBeTruthy();
  return String(match?.[1] || "");
}

test.describe("customer field consistency", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("legacy customer detail save persists profile edits and keeps the save button truthful", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await operatorToken(request);
    const suffix = `${Date.now()}-ui`;
    const tradeAccount = await createTradeAccount(request, token, suffix);

    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto(`/dashboard/trade-accounts/${tradeAccount.id}`, { waitUntil: "domcontentloaded" });

    const saveButton = page.getByTestId("trade-account-save-button");
    const primaryContact = page.getByLabel("Primary contact");
    const billingCity = page.getByLabel("Billing city");

    await primaryContact.fill("Avery Dispatcher");
    await billingCity.fill("Wakefield");
    await saveButton.click();

    await expect(page.getByTestId("trade-account-save-status")).toContainText(/Account details saved/i);
    await expect(saveButton).toBeEnabled();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Primary contact")).toHaveValue("Avery Dispatcher");
    await expect(page.getByLabel("Billing city")).toHaveValue("Wakefield");
  });

  test("mobile customer detail save stays readable and persists changes", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiProxy(page, request);
    const token = await operatorToken(request);
    const suffix = `${Date.now()}-mobile`;
    const tradeAccount = await createTradeAccount(request, token, suffix);

    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto(`/dashboard/trade-accounts/${tradeAccount.id}`, { waitUntil: "networkidle" });

    await page.getByLabel("Primary mobile").fill("07700900999");
    await page.getByTestId("trade-account-save-button").click();
    await expect(page.getByTestId("trade-account-save-status")).toContainText(/Account details saved/i);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Primary mobile")).toHaveValue("07700900999");
  });

  test("public portal and PDF resolve business fields from one canonical map", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await operatorToken(request);
    const suffix = `${Date.now()}`;
    const tradeAccount = await createTradeAccount(request, token, suffix);
    const job = await createJob(request, token, tradeAccount.id, suffix, false);
    const portalToken = extractPortalToken(String(job?.pdf?.url || job?.invoicePdfUrl || ""));

    const portalResponse = await request.get(`http://127.0.0.1:3000/public/job/${portalToken}`);
    expect(portalResponse.ok()).toBeTruthy();
    const portalBody = await portalResponse.json();
    expect(portalBody?.job?.customerProfile?.businessName).toBe(`E2E Consistency Fleet ${suffix}`);
    expect(portalBody?.job?.customerProfile?.primaryContact?.name).toBe("Jordan Lead");
    expect(portalBody?.job?.customerProfile?.secondaryContact?.name).toBe("Riley Backup");
    expect(portalBody?.job?.customerProfile?.businessAddress?.formatted).toBe("1 Trade Estate, Unit 4, Leeds, LS1 1AA, United Kingdom");
    expect(portalBody?.job?.customerProfile?.billingAddress?.formatted).toBe("PO Box 10, Dock Street, Bradford, BD1 1BB, United Kingdom");
    expect(portalBody?.job?.mergeFields?.tradeName).toBe(`E2E Consistency Fleet ${suffix}`);
    expect(portalBody?.job?.mergeFields?.customerTradeName).toBe(`E2E Consistency Fleet ${suffix}`);
    expect(portalBody?.job?.mergeFields?.primaryContactName).toBe("Jordan Lead");
    expect(String(portalBody?.job?.whatsappCompletionLink || "")).toContain("/portal/job/");
    expect(String(portalBody?.portal?.summary?.nextCustomerStep || "")).toMatch(/publishing the remaining customer documents|review the completed work summary|track progress/i);

    const pdfResponse = await request.get(`http://127.0.0.1:3000/public/job/${portalToken}/pdf`);
    expect(pdfResponse.ok()).toBeTruthy();
    const pdfBuffer = await pdfResponse.body();
    const pdfText = pdfBuffer.toString("utf8");
    expect(pdfText).toContain("DOCUMENT SUMMARY");
    expect(pdfText).toContain("COMPLETION SUMMARY");
    expect(pdfText).toContain(`Customer: E2E Consistency Fleet ${suffix}`);
    expect(pdfText).toContain("Primary contact: Jordan Lead | ops.");
    expect(pdfText).toContain("Secondary contact: Riley Backup | backup.");
    expect(pdfText).toContain(`Business IDs: VAT GB-VAT-${suffix} • Company COMP-${suffix}`);
    expect(pdfText).toContain("Business address: 1 Trade Estate, Unit 4, Leeds, LS1 1AA, United Kingdom");
    expect(pdfText).not.toContain("Billing address: PO Box 10, Dock Street, Bradford, BD1 1BB, United Kingdom");
    expect(pdfText).toContain("Customer portal:");
    expect(pdfText).toContain("Customer signature image: Captured");
    expect(pdfText).not.toContain("data:image/png;base64");

    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByText(`E2E Consistency Fleet ${suffix}`).first()).toBeVisible();
    await expect(page.getByText(/Customer details/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Service summary", exact: true })).toBeVisible();
    await expect(page.getByText(/Business IDs/i)).toBeVisible();
    await expect(page.getByText(/Billing address/i)).toBeVisible();
  });

  test("portal omits empty optional business blocks instead of showing broken labels", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await operatorToken(request);
    const suffix = `${Date.now()}-s`;
    const tradeAccount = await request.post("http://127.0.0.1:3000/trade-accounts", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        name: `E2E Sparse Fleet ${suffix}`,
        creditLimit: 0,
      },
    });
    expect(tradeAccount.ok()).toBeTruthy();
    const tradeAccountBody = await tradeAccount.json();
    const job = await createJob(request, token, tradeAccountBody.id, suffix, true);
    const portalToken = extractPortalToken(String(job?.pdf?.url || job?.invoicePdfUrl || ""));

    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByText(/Billing address/i)).toHaveCount(0);
    await expect(page.getByText(/Business IDs/i)).toHaveCount(0);
    await expect(page.getByText(/Secondary contact/i)).toHaveCount(0);

    const pdfResponse = await request.get(`http://127.0.0.1:3000/public/job/${portalToken}/pdf`);
    expect(pdfResponse.ok()).toBeTruthy();
    const pdfText = (await pdfResponse.body()).toString("utf8");
    expect(pdfText).not.toContain("Billing address:");
    expect(pdfText).not.toContain("Business IDs:");
    expect(pdfText).not.toContain("Secondary contact:");
  });

  test("normalized CRM locations and contacts persist and feed downstream document resolution", async ({ request }) => {
    const token = await operatorToken(request);
    const suffix = `${Date.now()}-n`;
    const tradeAccount = await createTradeAccount(request, token, suffix);

    const updated = await patchTradeAccountCrm(request, token, tradeAccount.id, {
      name: `E2E Normalized Fleet ${suffix}`,
      vatNumber: `GB-NORM-${suffix}`,
      companyNumber: `NORM-${suffix}`,
      locations: [
        {
          id: "hq-temp",
          name: "HQ Workshop",
          kind: "BUSINESS",
          addressLine1: "22 Foundry Way",
          addressLine2: "Unit 9",
          city: "Sheffield",
          postcode: "S1 2AB",
          country: "United Kingdom",
          isPrimary: true,
          isBilling: false,
          isActive: true,
        },
        {
          id: "billing-temp",
          name: "Accounts Office",
          kind: "BILLING",
          addressLine1: "PO Box 200",
          addressLine2: "Riverside",
          city: "York",
          postcode: "YO1 7ZZ",
          country: "United Kingdom",
          isPrimary: false,
          isBilling: true,
          isActive: true,
        },
      ],
      contacts: [
        {
          id: "ops-temp",
          name: "Morgan Ops",
          roleLabel: "Operations lead",
          email: `ops.${suffix}@normalized.test`,
          phone: "01144000000",
          mobile: "07700911001",
          tradeAccountLocationId: "hq-temp",
          isPrimary: true,
          isBilling: false,
          isActive: true,
          preferences: [
            { event: "JOB_COMPLETION", channel: "EMAIL", enabled: true },
            { event: "GENERAL_NOTIFICATION", channel: "WHATSAPP", enabled: true },
            { event: "UPDATE_CALL", channel: "PHONE", enabled: true },
          ],
        },
        {
          id: "accounts-temp",
          name: "Avery Accounts",
          roleLabel: "Accounts",
          email: `accounts.${suffix}@normalized.test`,
          phone: "01144000001",
          mobile: "",
          tradeAccountLocationId: "billing-temp",
          isPrimary: false,
          isBilling: true,
          isActive: true,
          preferences: [{ event: "INVOICE", channel: "EMAIL", enabled: true }],
        },
        {
          id: "site-temp",
          name: "Jamie Site",
          roleLabel: "Site contact",
          email: `site.${suffix}@normalized.test`,
          phone: "01144000002",
          mobile: "07700911002",
          tradeAccountLocationId: "hq-temp",
          isPrimary: false,
          isBilling: false,
          isActive: true,
          preferences: [],
        },
      ],
    });

    expect(Array.isArray(updated?.locations)).toBeTruthy();
    expect(Array.isArray(updated?.contacts)).toBeTruthy();
    expect(updated?.contactName).toBe("Morgan Ops");
    expect(updated?.billingContactName).toBe("Avery Accounts");
    expect(updated?.businessAddressLine1).toBe("22 Foundry Way");
    expect(updated?.billingAddressLine1).toBe("PO Box 200");

    const crmFullResponse = await request.get(`http://127.0.0.1:3000/crm/accounts/${tradeAccount.id}/full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(crmFullResponse.ok()).toBeTruthy();
    const crmFull = await crmFullResponse.json();
    expect(crmFull?.account?.locations).toHaveLength(2);
    expect(crmFull?.account?.contacts).toHaveLength(3);
    expect(
      crmFull?.account?.contacts?.find((contact: any) => contact.name === "Avery Accounts")?.preferences?.some(
        (preference: any) => preference.event === "INVOICE" && preference.channel === "EMAIL" && preference.enabled,
      ),
    ).toBeTruthy();

    const job = await createJob(request, token, tradeAccount.id, `${suffix}-job`, true);
    const portalToken = extractPortalToken(String(job?.pdf?.url || job?.invoicePdfUrl || ""));

    const portalResponse = await request.get(`http://127.0.0.1:3000/public/job/${portalToken}`);
    expect(portalResponse.ok()).toBeTruthy();
    const portalBody = await portalResponse.json();
    expect(portalBody?.job?.customerProfile?.primaryContact?.name).toBe("Morgan Ops");
    expect(portalBody?.job?.customerProfile?.secondaryContact?.name).toBe("Jamie Site");
    expect(portalBody?.job?.customerProfile?.businessAddress?.formatted).toBe("22 Foundry Way, Unit 9, Sheffield, S1 2AB, United Kingdom");
    expect(portalBody?.job?.customerProfile?.billingAddress?.formatted).toBe("PO Box 200, Riverside, York, YO1 7ZZ, United Kingdom");
    expect(portalBody?.job?.mergeFields?.billingContactName).toBe("Avery Accounts");
    expect(portalBody?.job?.mergeFields?.billingEmail).toBe(`accounts.${suffix}@normalized.test`);

    const pdfResponse = await request.get(`http://127.0.0.1:3000/public/job/${portalToken}/pdf`);
    expect(pdfResponse.ok()).toBeTruthy();
    const pdfText = (await pdfResponse.body()).toString("utf8");
    expect(pdfText).toContain("Primary contact: Morgan Ops | ops.");
    expect(pdfText).toContain("Secondary contact: Jamie Site | site.");
    expect(pdfText).not.toContain("Billing contact: Avery Accounts");
    expect(pdfText).not.toContain("Billing address: PO Box 200, Riverside, York, YO1 7ZZ, United Kingdom");
  });
});
