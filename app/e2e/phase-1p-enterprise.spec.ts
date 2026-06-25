import { execFileSync } from "child_process";
import path from "path";
import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const baseDir = path.join(__dirname, "..", "..");

function runScript(script: string, env: Record<string, string | undefined> = {}) {
  return execFileSync("bash", [script], {
    cwd: baseDir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post("http://127.0.0.1:3000/auth/login", {
    headers: { "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return String((await response.json())?.token || "");
}

test.describe("Phase 1P operational hardening", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("external uptime monitoring exposes truthful configured/verifying/healthy/degraded states", async () => {
    const unconfigured = runScript("./scripts/external-monitoring-status.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_URL: "",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER: "",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "",
    });
    expect(unconfigured).toContain("EXTERNAL_MONITOR_STATUS:not_configured");
    expect(unconfigured).toContain("No external uptime monitor is declared");

    const configured = runScript("./scripts/external-monitoring-status.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "Phase 1P monitor",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER: "uptime-kuma",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "",
    });
    expect(configured).toContain("EXTERNAL_MONITOR_STATUS:configured");
    expect(configured).toContain("EXTERNAL_MONITOR_PROVIDER:configured");

    const verifying = runScript("./scripts/external-monitoring-status.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "Phase 1P monitor",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "verifying",
    });
    expect(verifying).toContain("EXTERNAL_MONITOR_STATUS:verifying");

    const healthy = runScript("./scripts/external-monitoring-status.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "Phase 1P monitor",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "healthy",
    });
    expect(healthy).toContain("EXTERNAL_MONITOR_STATUS:healthy");

    const degraded = runScript("./scripts/external-monitoring-status.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "Phase 1P monitor",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "degraded",
    });
    expect(degraded).toContain("EXTERNAL_MONITOR_STATUS:degraded");
    expect(`${configured}${verifying}${healthy}${degraded}`).not.toContain("sk_live_");
    expect(`${configured}${verifying}${healthy}${degraded}`).not.toContain("sk_test_");
  });

  test("production readiness reports external monitor setup guidance without secrets", async () => {
    const output = runScript("./scripts/production-readiness-check.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "Phase 1P monitor",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER: "uptime-kuma",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "verifying",
    });
    expect(output).toContain("External uptime monitor");
    expect(output).toContain("verifying");
    expect(output).toContain("Hardcoded Stripe key guard");
    expect(output).not.toContain("sk_live_");
    expect(output).not.toContain("sk_test_");
    expect(output).not.toContain("whsec_");
  });

  test("job-pack pack 3 readiness is mapped while checkout stays explicitly blocked", async ({ request }) => {
    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const catalog = await requestLocalApi(request, "/admin/platform/billing-catalog", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(catalog.ok()).toBeTruthy();
    const body = await catalog.json();
    const pack3 = body.jobPackItems.find((item: any) => item.code === "job_completion_pack_3");
    expect(pack3).toBeTruthy();
    expect(pack3.jobCount).toBe(50);
    expect(pack3.verificationStatus).toBe("ready");
    expect(pack3.syncStatus).toBe("ready");
    expect(pack3.checkoutReadiness).toBe("setup_required");
    expect(pack3.nextAction).toMatch(/checkout|confirmation|webhook|canary/i);
    expect(body.jobPackCheckoutReadiness.status).toBe("setup_required");
    expect(body.jobPackCheckoutReadiness.blockers).toEqual(expect.arrayContaining(["explicit_checkout_confirmation_required"]));
    expect(JSON.stringify(body)).not.toContain("sk_live_");
    expect(JSON.stringify(body)).not.toContain("sk_test_");
  });

  test("tenant and platform operational views remain separated", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/settings/operations", { waitUntil: "networkidle" });
    await expect(page.getByTestId("operations-readiness-table")).toBeVisible();
    await expect(page.getByTestId("external-monitor-provider-card")).toHaveCount(0);
    await expect(page.getByTestId("backup-readiness-card")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/platform billing catalog|global platform diagnostics|backup confidence/i);

    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform", { waitUntil: "networkidle" });
    await expect(page.getByTestId("platform-system-monitoring")).toBeVisible();
    await expect(page.getByTestId("platform-billing-catalog-admin")).toBeVisible();
  });
});
