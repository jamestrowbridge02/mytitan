import { expect, request as playwrightRequest, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs } from "./utils";

async function operatorToken() {
  const context = await playwrightRequest.newContext({
    baseURL: `${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}`,
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });
  try {
    const response = await context.post("/auth/login", {
      data: {
        email: "e2e.operator@mytitan.local",
        password: "MyTitanE2E!2026",
      },
    });
    const body = await response.json();
    return String(body?.token || "");
  } finally {
    await context.dispose();
  }
}

async function resetGuidedSetup(request: any) {
  const token = await operatorToken();
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/guided-setup/reset`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok()) {
    throw new Error(`Unable to reset guided setup (${response.status()})`);
  }
}

async function restoreSharedWorkspaceName(request: any) {
  const token = await operatorToken();
  const response = await request.put(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/tenant/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { companyName: "__E2E MyTitan Workspace" },
  });
  if (!response.ok()) {
    throw new Error(`Unable to restore shared workspace name (${response.status()})`);
  }
}

test.describe("guided setup continuity", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test.beforeEach(async ({ request }) => {
    await resetGuidedSetup(request);
  });

  test.afterEach(async ({ request }) => {
    await restoreSharedWorkspaceName(request);
  });

  test("operator can save and resume guided setup without being trapped in legacy onboarding", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard");
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
    await expect(page.getByText(/set up the workspace, open the booking path, complete the first job, send the result, and get paid/i)).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("guided-setup-company-name").fill("E2E Guided Setup Resume");
    await page.getByTestId("guided-setup-save-exit-header").evaluate((element: HTMLButtonElement) => element.click());

    await expect(page).toHaveURL(/\/dashboard(\/|$)/);
    const token = await operatorToken();
    const statusResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/guided-setup/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(statusResponse.ok()).toBeTruthy();
    const status = await statusResponse.json();
    expect(Number(status?.currentStep || 0)).toBeGreaterThanOrEqual(1);
  });

  test("settings rerun path reopens guided setup as an editable flow", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: /Finish setup|Review setup/i }).first().evaluate((element: HTMLButtonElement) => element.click());

    await expect(page).toHaveURL(/\/dashboard\/setup-wizard$/);
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  });

  test("billing and calendar setup stay truthful to Stripe readiness", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard");
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Your business" })).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Your services" })).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    const calendarStep = page.getByTestId("guided-setup-calendar-step");
    await expect(calendarStep).toBeVisible();
    await calendarStep.getByRole("checkbox").check();
    await page.getByTestId("guided-setup-start-time").fill("08:30");
    await page.getByTestId("guided-setup-end-time").fill("17:30");
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());

    const billingStep = page.getByTestId("guided-setup-billing-step");
    await expect(billingStep).toContainText(/Stripe is not ready|Stripe is ready/i);
    await expect(billingStep).toContainText(/Manual follow-up stays available/i);
    const billingCopy = (await billingStep.textContent()) || "";
    const enablePayments = page.getByTestId("guided-setup-enable-payments");
    if (/Stripe is ready/i.test(billingCopy)) {
      await expect(enablePayments).toBeEnabled();
    } else {
      await expect(enablePayments).toBeDisabled();
    }
  });

  test("calendar setup lets operators choose operating days", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard");
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Your business" })).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Your services" })).toBeVisible();
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    const operatingDays = page.getByTestId("guided-setup-operating-days");
    await expect(operatingDays).toBeVisible();
    const saturdayButton = operatingDays.getByRole("button", { name: "Sat" });
    if ((await saturdayButton.getAttribute("aria-pressed")) !== "true") {
      await saturdayButton.click();
    }
    await expect(saturdayButton).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("guided-setup-start-time").fill("08:00");
    await page.getByTestId("guided-setup-end-time").fill("16:00");
    await page.getByRole("button", { name: "Save and continue" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();

    const token = await operatorToken();
    const statusResponse = await request.get(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/guided-setup/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    expect(statusResponse.ok()).toBeTruthy();
    const status = await statusResponse.json();
    const dayValues = Array.isArray(status?.calendar?.businessHours)
      ? status.calendar.businessHours.map((entry: any) => Number(entry?.dayOfWeek))
      : [];
    expect(dayValues).toContain(6);
  });
});
