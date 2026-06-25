import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

test.describe("phase 6 category leader commercial readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");
  const tenantId = "e2e-company";

  test("first-login onboarding exposes live preview-first import and colour controls", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/setup-wizard", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase6-onboarding-wizard")).toContainText(/Get operational in 15 minutes/i);
    for (const key of ["business", "locations", "services", "job_sheet", "booking", "portal", "payments", "team", "import", "golive"]) {
      await expect(page.getByTestId(`phase6-onboarding-step-${key}`)).toBeVisible();
      await expect(page.getByTestId(`phase6-onboarding-step-${key}`)).toHaveAttribute("href", /\/dashboard\/|#phase6-import-wizard/);
    }
    await expect(page.getByTestId("phase6b-colour-settings")).toContainText(/Services|Suppliers|Team members|Locations|accessible defaults/i);
    await expect(page.getByTestId("phase6b-calendar-legend")).toContainText(/OPEN|IN PROGRESS|COMPLETED|INVOICED|CANCELLED/i);
    await expect(page.getByTestId("phase6-import-wizard")).toContainText(/Live CSV import and rollback|previewed before commit|Payment mutations are not supported/i);
    await expect(page.getByTestId("phase6-import-preview")).toBeDisabled();
  });

  test("advanced permissions describe scalable roles and guarded access boundaries", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/users", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase6-advanced-permissions")).toContainText(/Advanced role foundations/i);
    for (const key of ["owner", "admin", "finance", "dispatcher", "technician", "viewer", "location_manager", "commercial_read_only"]) {
      await expect(page.getByTestId(`phase6-role-${key}`)).toBeVisible();
    }
    await expect(page.getByTestId("phase6-permission-safeguards")).toContainText(/Location-level permissions|Finance-only permissions|Technician-only views|Portal\/support restrictions|Audit role changes/i);
  });

  test("forecasting uses source evidence, assumptions, confidence, and limitations", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);

    await page.goto("/dashboard/analytics", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase6-forecasting-engine")).toContainText(/Real source data only/i);
    for (const key of ["revenue", "workload", "technician_capacity", "location_capacity", "invoice_risk", "stock_demand", "absence_impact", "completion_velocity"]) {
      const card = page.getByTestId(`phase6-forecast-${key}`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(/Source data:|Assumption:|Limitation:/i);
      await expect(card).toContainText(/Low|Medium|High|Limited/i);
      await expect(card).toHaveAttribute("href", /\/dashboard\//);
    }
    await expect(page.getByTestId("phase6-forecasting-engine")).not.toContainText(/AI generated|guaranteed|fake/i);
  });

  test("platform-only customer success and observability stay separated from tenant enterprise trust", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase6-platform-customer-success-observability")).toContainText(/Customer success and internal observability/i);
    await expect(page.getByTestId("phase6-customer-success-tooling")).toContainText(/Tenant health score|Onboarding progress|Feature adoption|Support mode insight|Churn risk indicators|Account health summary/i);
    await expect(page.getByTestId("phase6-internal-observability")).toContainText(/Queue health|Sync health|Automation health|Notification health|Integration health|Offline sync health|Job-pack sync health|Backup evidence|Error trends/i);
    await expect(page.getByTestId("phase6-internal-observability")).toContainText(/No external uptime monitor is configured or required/i);

    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });
    await expect(page.getByTestId("phase6-business-continuity-trust-pack")).toContainText(/Backup restore evidence|Audit export package|Access review report|Data retention controls|Disaster recovery readiness|Incident response checklist|Security control register|Accreditation evidence folder/i);
    await expect(page.locator("body")).not.toContainText(/Customer success and internal observability|Queue health|No external uptime monitor is configured or required/i);
  });

  test("enterprise account management remains platform-only while tenants see safe trust evidence", async ({ page, request }) => {
    await installApiProxy(page, request);
    const platformToken = await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);

    const allowanceResponse = await requestLocalApi(request, `/admin/platform/tenants/${tenantId}/job-allowance`, {
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    expect(allowanceResponse.ok()).toBeTruthy();
    const allowance = await allowanceResponse.json();
    expect(allowance).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        planIncludedAllowance: expect.any(Number),
        remainingAllowance: expect.any(Number),
        unlimitedJobs: expect.any(Boolean),
        manualCreditsTotal: expect.any(Number),
        temporaryCreditsTotal: expect.any(Number),
      }),
    }));

    await loginAs(page, request, defaultOperatorEmail, defaultOperatorPassword);
    await page.goto("/dashboard/enterprise", { waitUntil: "networkidle" });
    await expect(page.locator("body")).not.toContainText(/Manual credit delta|Temporary bonus credits|Reason for audit/i);
    const trustCards = page.locator('[data-testid^="phase6-trust-"]');
    const count = await trustCards.count();
    expect(count).toBeGreaterThanOrEqual(8);
    for (let index = 0; index < count; index += 1) {
      await expect(trustCards.nth(index)).toHaveAttribute("href", /\/dashboard\//);
      await expect(trustCards.nth(index)).toContainText(/Open evidence/);
    }
  });
});
