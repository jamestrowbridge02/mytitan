import { expect, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("final product experience polish", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("company profile is the shared source for setup and dependent customer surfaces", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    const businessName = `E2E Profile ${Date.now()}`;
    await page.goto("/dashboard/settings?tab=general&section=company-profile-hub", { waitUntil: "networkidle" });

    const hub = page.getByTestId("company-profile-hub");
    await expect(hub).toBeVisible();
    for (const section of [
      "business",
      "brand",
      "locations",
      "staff",
      "opening-hours",
      "services",
      "payments",
      "tax",
      "booking",
      "customer-portal",
      "trade-portal",
      "communication",
    ]) {
      await expect(page.getByTestId(`company-profile-section-${section}`)).toBeVisible();
    }

    await page.getByTestId("settings-business-name").fill(businessName);
    await page.getByTestId("company-profile-save").click();
    await expect(page.getByTestId("company-profile-saved-state")).toContainText("All profile changes saved");

    await page.goto("/dashboard/setup-wizard?step=branding", { waitUntil: "networkidle" });
    await expect(page.getByTestId("guided-setup-company-name")).toHaveValue(businessName);

    await page.goto("/dashboard/booking/settings", { waitUntil: "networkidle" });
    await expect(page.getByTestId("booking-public-preview")).toContainText(/Customer preview|Open public link|Copy public booking link/i);
  });

  test("setup checklist has the launch steps and no dead setup actions", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/setup-wizard", { waitUntil: "networkidle" });
    const expectedSteps = [
      "Business",
      "Brand",
      "Locations",
      "Staff",
      "Opening hours",
      "Services",
      "Payments",
      "Email",
      "Customer portal",
      "Trade portal",
      "Booking",
      "Launch",
    ];
    for (const label of expectedSteps) {
      await expect(page.getByTestId("phase6-onboarding-wizard")).toContainText(label);
    }

    const hrefs = await page.getByTestId("phase6-onboarding-wizard").locator("a").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") || ""),
    );
    expect(hrefs.every((href) => href && (!href.startsWith("#") || href === "#phase6-import-wizard"))).toBeTruthy();
  });

  test("calendar presents an operations lens without tenant-facing version language", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/calendar", { waitUntil: "networkidle" });
    await expect(page.locator('[data-calendar-experience="operations"]')).toBeVisible();
    await expect(page.getByTestId("calendar-click-to-action-rail")).toContainText(/Location bookings|Staff rota|Capacity and absence/i);
    await expect(page.getByTestId("operations-command-lenses")).toContainText(/Bookings|Staff rota|Availability|Capacity|Assets|Fleet|Live map/i);
    await expect(page.getByTestId("operations-capacity-summary")).toContainText(/booked from|available|Utilisation/i);
    await expect(page.getByTestId("operations-route-foundation")).toContainText(/Traffic-aware optimisation remains unavailable until a maps provider is configured/i);
    await page.getByTestId("operations-lens-capacity").click();
    await expect(page.getByTestId("calendar-planning-mode-rota")).toHaveClass(/primary/);
    await expect(page.getByTestId("operations-actionable-warnings")).toContainText(/Missing cover|unassigned work|capacity/i);
    await expect(page.locator("body")).not.toContainText(/Calendar V2|calendar-v2|\bversion\b/i);
  });

  test("business health is truthful about live data and avoids fake readiness", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/intelligence", { waitUntil: "networkidle" });
    const health = page.getByTestId("business-health-engine");
    await expect(health).toBeVisible();
    await expect(health).toContainText("real bookings, jobs, invoices, locations, technicians, customers, reviews, and stock records");
    await expect(health).not.toContainText(/99\.9%|fake|fabricated/i);
  });
});
