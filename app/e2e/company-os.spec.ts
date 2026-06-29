import { execFileSync } from "child_process";
import path from "path";
import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const baseDir = path.join(__dirname, "..", "..");

async function apiLogin(request: any, email: string, password: string) {
  const response = await requestLocalApi(request, "/auth/login", {
    method: "POST",
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

function expectNoSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(/sk_live_|sk_test_|whsec_|STRIPE_[A-Z_]*SECRET|platformSecretEncrypted|webhookSecretEncrypted|smtpPasswordEncrypted/i);
}

test.describe("Company OS", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures before running Company OS tests.");

  test("platform admin can view the Company OS and tenant users cannot access it", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform/company-os", { waitUntil: "networkidle" });

    await expect(page.getByTestId("company-os-page")).toBeVisible();
    await expect(page.getByTestId("company-os-section-engineering")).toContainText("Engineering Excellence");
    await expect(page.getByTestId("company-os-engineering-dashboard")).toContainText("Test suite status");
    await expect(page.getByTestId("company-os-platform-operations")).toContainText("External uptime");
    await expect(page.getByTestId("company-os-section-operations")).toContainText("Infrastructure");
    await expect(page.getByTestId("company-os-autopilot-linkage")).toContainText("Autopilot");
    await expect(page.locator("body")).not.toContainText(/sk_live_|sk_test_|whsec_|platformSecretEncrypted|webhookSecretEncrypted|smtpPasswordEncrypted/i);

    const tenantToken = await apiLogin(request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    const denied = await requestLocalApi(request, "/admin/platform/company-os", {
      headers: { Authorization: `Bearer ${tenantToken}` },
    });
    expect([401, 403]).toContain(denied.status());
  });

  test("dashboards show truthful commercial, success, enterprise, and release states", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const response = await requestLocalApi(request, "/admin/platform/company-os", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expectNoSecrets(body);

    expect(body.statusTaxonomy).toEqual(expect.arrayContaining(["actual", "forecast", "not_configured", "not_enough_data", "roadmap"]));
    expect(body.commercial.actualMrr).toMatchObject({ state: "actual" });
    expect(body.commercial.actualMrr.value).toMatch(/£0\.00|£[0-9]+\.[0-9]{2}/);
    expect(body.commercial.actualMrrUsd).toMatchObject({ value: "$0.00", state: "actual" });
    expect(body.commercial.paidCustomers).toMatchObject({ state: "actual" });
    expect(body.commercial.tenantCustomerMoneyExcluded).toBe(true);
    expect(body.customerSuccess.nps).toMatchObject({ state: "not_enough_data" });
    expect(body.customerSuccess.csat).toMatchObject({ state: "not_enough_data" });
    expect(body.enterprise.sso).toMatchObject({ state: "roadmap" });
    expect(body.enterprise.scim).toMatchObject({ state: "roadmap" });
    expect(body.enterprise.dataResidency).toMatchObject({ state: "roadmap" });
    expect(body.operations.uptimeMonitorState.state).toMatch(/actual|not_configured/);
    expect(body.releaseGovernance.currentTag).toBeTruthy();
    expect(body.releaseGovernance.commitHash).toBeTruthy();
  });

  test("platform incident can be created and remains platform-only", async ({ request }) => {
    const platformToken = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const headers = { Authorization: `Bearer ${platformToken}`, "Content-Type": "application/json" };
    const created = await requestLocalApi(request, "/admin/platform/company-os/incidents", {
      method: "POST",
      headers,
      data: {
        severity: "high",
        affectedService: "e2e-company-os",
        owner: "Platform Ops",
        summary: "E2E Company OS incident",
        customerImpact: "No customer impact confirmed in e2e.",
        preventionAction: "Keep Company OS incident regression covered.",
      },
    });
    expect(created.ok()).toBeTruthy();
    const createdBody = await created.json();
    expect(createdBody.incident).toMatchObject({
      severity: "high",
      affectedService: "e2e-company-os",
      owner: "Platform Ops",
      customerImpact: "No customer impact confirmed in e2e.",
    });
    expectNoSecrets(createdBody);

    const tenantToken = await apiLogin(request, fixtureRefs.financeEmail, fixtureRefs.financePassword);
    const denied = await requestLocalApi(request, "/admin/platform/company-os/incidents", {
      method: "POST",
      headers: { Authorization: `Bearer ${tenantToken}`, "Content-Type": "application/json" },
      data: { summary: "tenant denied incident" },
    });
    expect([401, 403]).toContain(denied.status());
  });

  test("SaaS ops report script runs and excludes secrets", async () => {
    const output = execFileSync("bash", ["./scripts/create-saas-ops-report.sh", "e2e-company-os"], {
      cwd: baseDir,
      encoding: "utf8",
      env: {
        ...process.env,
        MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "",
        MYTITAN_EXTERNAL_UPTIME_MONITOR_URL: "",
        MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER: "",
      },
    });
    expect(output).toContain("SaaS ops report generated");
    expect(output).not.toMatch(/sk_live_|sk_test_|whsec_|STRIPE_[A-Z_]*SECRET|platformSecretEncrypted|webhookSecretEncrypted|smtpPasswordEncrypted/i);
  });
});
