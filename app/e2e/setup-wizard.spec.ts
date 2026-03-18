import { expect, request as playwrightRequest, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs } from "./utils";

async function operatorToken() {
  const context = await playwrightRequest.newContext({
    baseURL: "http://127.0.0.1:3000",
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
  const response = await request.post("http://127.0.0.1:3000/guided-setup/reset", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok()) {
    throw new Error(`Unable to reset guided setup (${response.status()})`);
  }
}

test.describe("guided setup continuity", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test.beforeEach(async ({ request }) => {
    await resetGuidedSetup(request);
  });

  test("operator can save and resume guided setup without being trapped in legacy onboarding", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard");
    await expect(page.getByRole("heading", { name: "Guided setup" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await page.getByTestId("guided-setup-company-name").fill("E2E Guided Setup Resume");
    await page.getByTestId("guided-setup-save-exit-header").evaluate((element: HTMLButtonElement) => element.click());

    await expect(page).toHaveURL(/\/dashboard(\/|$)/);
    const token = await operatorToken();
    const statusResponse = await request.get("http://127.0.0.1:3000/guided-setup/status", {
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
    await page.getByRole("button", { name: /Resume guided setup|Review guided setup/i }).first().evaluate((element: HTMLButtonElement) => element.click());

    await expect(page).toHaveURL(/\/dashboard\/setup-wizard$/);
    await expect(page.getByRole("heading", { name: "Guided setup" })).toBeVisible();
  });

  test("billing and calendar setup stay truthful when Stripe is unavailable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard");
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Business branding" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText(/^Services$/i)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Charging and calendar" })).toBeVisible();

    const calendarStep = page.getByTestId("guided-setup-calendar-step");
    await expect(calendarStep).toBeVisible();
    await calendarStep.getByRole("checkbox").check();
    await page.getByTestId("guided-setup-start-time").fill("08:30");
    await page.getByTestId("guided-setup-end-time").fill("17:30");
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());

    const billingStep = page.getByTestId("guided-setup-billing-step");
    await expect(billingStep).toContainText(/Stripe unavailable|Stripe ready/i);
    await expect(page.getByTestId("guided-setup-enable-payments")).toBeDisabled();
  });

  test("calendar setup lets operators choose operating days", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard");
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Business branding" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Charging and calendar" })).toBeVisible();

    const operatingDays = page.getByTestId("guided-setup-operating-days");
    await expect(operatingDays).toBeVisible();
    const saturdayButton = operatingDays.getByRole("button", { name: "Sat" });
    await saturdayButton.evaluate((element: HTMLButtonElement) => element.click());
    await expect(saturdayButton).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("guided-setup-start-time").fill("08:00");
    await page.getByTestId("guided-setup-end-time").fill("16:00");
    await page.getByRole("button", { name: "Next" }).evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByRole("heading", { name: "Billing and payments" })).toBeVisible();

    const token = await operatorToken();
    const statusResponse = await request.get("http://127.0.0.1:3000/guided-setup/status", {
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
