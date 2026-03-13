import { expect, test } from "@playwright/test";

import { installApiProxy } from "./utils";

test.describe("payments hardening", () => {
  test("operator billing page degrades gracefully when Stripe is unavailable", async ({ page, request }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await installApiProxy(page, request);
    const response = await page.goto("/dashboard/billing", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expect(page.getByText(/Stripe checkout unavailable|Manage billing in Stripe/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("billing readiness route renders without client-side exceptions", async ({ page, request }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await installApiProxy(page, request);
    const response = await page.goto("/dashboard/billing/readiness", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByText(/Billing readiness|Billing access restricted/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("public portal payment surface renders without client-side exceptions", async ({ page, request }) => {
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });

    await installApiProxy(page, request);
    const response = await page.goto("/portal/job/e2e-public-portal-token", { waitUntil: "networkidle" });

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("public-portal-billing-progress")).toBeVisible();
    await expect(page.getByText(/Secure payment available here|Payment handoff not enabled|Secure payment is unavailable/i).first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
