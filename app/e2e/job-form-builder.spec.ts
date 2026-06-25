import { expect, test } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy } from "./utils";

test.use({ storageState: authFile });

async function openWorksheet(page: any) {
  const fullFormToggle = page.getByRole("button", { name: "Open full form" });
  if (await fullFormToggle.count()) {
    await fullFormToggle.first().click();
  }
  const disclosure = page.getByTestId("job-form-disclosure-worksheet");
  if (await disclosure.count()) {
    const isOpen = await disclosure.evaluate((node) => node instanceof HTMLDetailsElement && node.open);
    if (!isOpen) {
      await disclosure.locator("summary").click();
    }
  }
}

async function getToken(page: any) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return String(token || "");
}

async function getTenantSettings(request: any, token: string) {
  const response = await request.get("http://127.0.0.1:3000/tenant/settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function patchTenantSettings(request: any, token: string, data: Record<string, unknown>) {
  const response = await request.patch("http://127.0.0.1:3000/tenant/settings", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("workspace job-sheet builder and service type management", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("default wheels worksheet fields come from the builder model while protected blocks stay fixed", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=workflow");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);
    const currentBusinessConfig =
      currentSettings?.businessConfigJson && typeof currentSettings.businessConfigJson === "object"
        ? currentSettings.businessConfigJson
        : {};

    await patchTenantSettings(request, token, {
      businessConfigJson: {
        ...currentBusinessConfig,
        jobForms: {
          declarationText: ((currentBusinessConfig as any).jobForms || {}).declarationText || null,
          serviceTypes: [
            { id: "tyre_change", name: "Tyre Change", enabled: true, retired: false, order: 0 },
          ],
        },
      },
    });

    await page.goto("/dashboard/jobs/new");
    await openWorksheet(page);
    await expect(page.getByTestId("job-form-builder-runtime")).toBeVisible();
    await expect(page.getByTestId("job-form-service-type-select")).toHaveValue("tyre_change");
    await expect(page.getByTestId("job-form-field-wheel_nsf")).toBeVisible();
    await expect(page.getByTestId("job-form-field-looseWheels")).toBeVisible();
    await expect(page.getByTestId("job-form-field-customerNotes")).toBeVisible();
    await expect(page.getByTestId("job-form-field-technicianSignature")).toHaveCount(0);
    await expect(page.getByTestId("job-form-field-invoiceNumber")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sign-off" })).toBeVisible();
    await expect(page.getByTestId("job-form-disclosure-declaration")).toContainText("Declaration");
    await expect(page.getByTestId("jobs-signature-open-technician")).toBeVisible();
    await expect(page.getByTestId("jobs-signature-open-customer")).toBeVisible();
    await page.getByTestId("jobs-signature-open-technician").click();
    await expect(page.getByTestId("jobs-signature-modal")).toBeVisible();
    await expect(page.getByTestId("jobs-signature-pad-technician")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByTestId("jobs-signature-open-customer").click();
    await expect(page.getByTestId("jobs-signature-modal")).toBeVisible();
    await expect(page.getByTestId("jobs-signature-pad-customer")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();
  });

  test("owners can manage service types and only active types appear on the live job form", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=services");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);
    const currentBusinessConfig =
      currentSettings?.businessConfigJson && typeof currentSettings.businessConfigJson === "object"
        ? currentSettings.businessConfigJson
        : {};

    await patchTenantSettings(request, token, {
      businessConfigJson: {
        ...currentBusinessConfig,
        jobForms: {
          ...(currentBusinessConfig.jobForms || {}),
          serviceTypes: [],
          sections: [],
          fields: [],
        },
      },
    });

    await page.reload();
    await page.getByTestId("settings-service-type-add").click();
    await page.getByTestId("settings-service-type-add").click();

    const rows = page.getByTestId("settings-service-type-row");
    await rows.nth(0).locator('input').nth(0).fill("Retired Builder Service");
    await rows.nth(1).locator('input').nth(0).fill("Priority Wheel Repair");
    await rows.nth(0).locator('input[type="checkbox"]').nth(1).check();
    await rows.nth(1).getByRole("button", { name: "Up" }).click();
    const saveButton = page.getByTestId("settings-save-button");
    await saveButton.click();
    await expect(saveButton).toContainText(/Saved/i);
    await expect(saveButton).toBeDisabled();

    await page.goto("/dashboard/jobs/new");
    const worksheetDisclosure = page.getByTestId("job-form-disclosure-worksheet");
    if (await worksheetDisclosure.count()) {
      const isOpen = await worksheetDisclosure.evaluate((node) => node instanceof HTMLDetailsElement && node.open);
      if (!isOpen) {
        await worksheetDisclosure.locator("summary").click();
      }
    }
    const serviceTypeSelect = page.getByTestId("job-form-service-type-select");
    await expect(serviceTypeSelect).toBeVisible();
    await expect(serviceTypeSelect.locator("option")).toContainText(["Priority Wheel Repair"]);
    await expect(serviceTypeSelect.locator("option")).not.toContainText(["Retired Builder Service"]);
  });

  test("owners can configure service-specific fields, runtime required checks apply, and historical jobs keep stored values", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=workflow");
    const token = await getToken(page);
    const currentSettings = await getTenantSettings(request, token);
    const currentBusinessConfig =
      currentSettings?.businessConfigJson && typeof currentSettings.businessConfigJson === "object"
        ? currentSettings.businessConfigJson
        : {};

    await patchTenantSettings(request, token, {
      businessConfigJson: {
        ...currentBusinessConfig,
        jobForms: {
          ...(currentBusinessConfig.jobForms || {}),
          serviceTypes: [
            { id: "priority_repair", name: "Priority Wheel Repair", enabled: true, retired: false, order: 0 },
          ],
          sections: [],
          fields: [],
        },
      },
    });

    await page.reload();
    await page.getByTestId("settings-job-form-section-add").click();
    const sectionRow = page.getByTestId("settings-job-form-section-row").first();
    await sectionRow.locator('input').nth(0).fill("Site readiness");
    await sectionRow.locator('input').nth(1).fill("Collect the access and handover details needed before work starts.");
    await sectionRow.locator("select").selectOption(["priority_repair"]);

    await page.getByTestId("settings-job-form-field-add").click();
    const fieldRow = page.getByTestId("settings-job-form-field-row").first();
    await fieldRow.locator('input').nth(0).fill("site_gate_code");
    await fieldRow.locator('input').nth(1).fill("Site gate code");
    await fieldRow.locator("select").nth(0).selectOption("text");
    await fieldRow.locator("select").nth(1).selectOption({ label: "Site readiness" });
    await fieldRow.locator('input').nth(2).fill("The customer access code for the site gate.");
    await fieldRow.locator("select").nth(2).selectOption(["priority_repair"]);
    await fieldRow.locator('input[type="checkbox"]').nth(0).check();
    const saveButton = page.getByTestId("settings-save-button");
    await saveButton.click();
    await expect(saveButton).toContainText(/Saved/i);
    await expect(saveButton).toBeDisabled();

    await page.goto("/dashboard/jobs/new");
    await openWorksheet(page);
    await page.getByTestId("job-form-service-type-select").selectOption("priority_repair");
    await expect(page.getByText("Site readiness")).toBeVisible();
    await expect(page.getByTestId("job-form-field-site_gate_code")).toBeVisible();
    const missingFieldResponse = await request.post("http://127.0.0.1:3000/jobs", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        customerName: "E2E Builder Fleet",
        customerEmail: "builder@example.test",
        customerPhone: "01133009900",
        serviceName: "Priority Wheel Repair",
        tradeCode: "WHEELS",
        jobType: "Trade",
        formData: {
          serviceTypeId: "priority_repair",
          serviceTypeName: "Priority Wheel Repair",
        },
      },
    });
    expect(missingFieldResponse.status()).toBe(400);
    const missingFieldBody = await missingFieldResponse.json();
    expect(String(missingFieldBody?.message || "")).toContain("Please complete the required service fields: Site gate code.");

    const createdJobResponse = await request.post("http://127.0.0.1:3000/jobs", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        customerName: "E2E Builder Fleet",
        customerEmail: "builder@example.test",
        customerPhone: "01133009900",
        serviceName: "Priority Wheel Repair",
        tradeCode: "WHEELS",
        jobType: "Trade",
        formData: {
          serviceTypeId: "priority_repair",
          serviceTypeName: "Priority Wheel Repair",
          site_gate_code: "GATE-4421",
        },
      },
    });
    expect(createdJobResponse.ok()).toBeTruthy();
    const createdJob = await createdJobResponse.json();

    await patchTenantSettings(request, token, {
      businessConfigJson: {
        ...currentBusinessConfig,
        jobForms: {
          ...((currentBusinessConfig as any).jobForms || {}),
          serviceTypes: [
            { id: "priority_repair", name: "Priority Wheel Repair", enabled: true, retired: false, order: 0 },
          ],
          sections: [],
          fields: [],
        },
      },
    });

    await page.goto("/dashboard/jobs/new");
    await openWorksheet(page);
    await page.getByTestId("job-form-service-type-select").selectOption("priority_repair");
    await expect(page.getByTestId("job-form-field-site_gate_code")).toHaveCount(0);

    const jobDetailResponse = await request.get(`http://127.0.0.1:3000/jobs/${createdJob.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(jobDetailResponse.ok()).toBeTruthy();
    const jobDetail = await jobDetailResponse.json();
    expect(jobDetail?.formData?.site_gate_code).toBe("GATE-4421");
  });
});
