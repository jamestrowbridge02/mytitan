import { expect, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs } from "./utils";

async function createTradeAccount(request: any, token: string, suffix: string) {
  const response = await request.post("http://127.0.0.1:3000/trade-accounts", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: {
      name: `E2E CRM Draft ${suffix}`,
      contactName: "Jordan Lead",
      contactEmail: `crm-draft-${suffix}@example.test`,
      contactPhone: "01133000000",
      creditLimit: 0,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("crm note draft persistence", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("crm draft failures stay truthful and recover from local fallback on reload", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    const loginResponse = await request.post("http://127.0.0.1:3000/auth/login", {
      data: {
        email: "e2e.operator@mytitan.local",
        password: "MyTitanE2E!2026",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const { token } = await loginResponse.json();
    const account = await createTradeAccount(request, String(token), `${Date.now()}`);

    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
        if (url.includes("/drafts/crm-note")) {
          return new Response(JSON.stringify({ message: "CRM draft save failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(input, init);
      };
    });

    await page.goto(`/dashboard/trade-accounts/${account.id}`, { waitUntil: "networkidle" });

    await page.getByPlaceholder("Add a note...").fill("Call customer about wheel damage history");
    await page.locator("#next-action-type").selectOption("CALL");
    await page.locator("#next-action-date").fill("2026-04-02");
    await page.locator("#next-action-user").fill("e2e-follow-up-user");

    await expect(page.getByText("Draft save failed. Changes are kept locally until the connection recovers.")).toBeVisible();
    await expect(page.getByText("Draft: Save failed")).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByPlaceholder("Add a note...")).toHaveValue("Call customer about wheel damage history");
    await expect(page.locator("#next-action-type")).toHaveValue("CALL");
    await expect(page.locator("#next-action-date")).toHaveValue("2026-04-02");
    await expect(page.locator("#next-action-user")).toHaveValue("e2e-follow-up-user");
  });

  test("submitted crm notes do not reappear from stale draft state after reload", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    const loginResponse = await request.post("http://127.0.0.1:3000/auth/login", {
      data: {
        email: "e2e.operator@mytitan.local",
        password: "MyTitanE2E!2026",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const { token } = await loginResponse.json();
    const account = await createTradeAccount(request, String(token), `${Date.now()}-submitted`);

    await page.goto(`/dashboard/trade-accounts/${account.id}`, { waitUntil: "networkidle" });

    await page.getByPlaceholder("Add a note...").fill("Confirm service plan handover with site lead");
    await page.locator("#next-action-type").selectOption("EMAIL");
    await page.locator("#next-action-date").fill("2026-04-03");
    await page.locator("#next-action-user").fill("e2e-crm-owner");

    await expect(page.getByText("Draft: Saved")).toBeVisible();

    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Note added")).toBeVisible();
    await expect(page.getByPlaceholder("Add a note...")).toHaveValue("");

    await page.reload({ waitUntil: "networkidle" });

    await expect(page.getByPlaceholder("Add a note...")).toHaveValue("");
    await expect(page.locator("#next-action-type")).toHaveValue("EMAIL");
    await expect(page.locator("#next-action-date")).toHaveValue("2026-04-03");
    await expect(page.locator("#next-action-user")).toHaveValue("e2e-crm-owner");
  });
});
