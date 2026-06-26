import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { expect, test } from "@playwright/test";
import { fixtureRefs, loginAs, requestLocalApi } from "./utils";

const repoRoot = path.join(__dirname, "..", "..");
const evidenceDoc = path.join(repoRoot, "docs/audit/phase-18-evidence-based-certification-gate.md");

function runScript(script: string, env: Record<string, string | undefined> = {}) {
  return execFileSync("bash", [script], {
    cwd: repoRoot,
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

test.describe("phase 18 evidence-based certification gate", () => {
  test("scorecard cannot show 10/10 while critical evidence is missing", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform#excellence", { waitUntil: "networkidle" });

    const scorecard = page.getByTestId("phase17-excellence-scorecard");
    await expect(scorecard).toBeVisible();
    await expect(scorecard).toContainText("Scores are deliberately evidence-led");
    await expect(scorecard).toContainText("Evidence attached");
    await expect(scorecard).toContainText("Missing evidence");
    await expect(scorecard).toContainText("10/10 gate");
    await expect(scorecard).toContainText("Blocked while critical evidence is missing");
    await expect(scorecard).toContainText("Independent security assessment: not attached.");
    await expect(scorecard).toContainText("Production Web Vitals evidence: not attached.");
    await expect(scorecard).toContainText("External uptime monitor: not_configured");

    const cards = scorecard.locator(".platform-admin-excellence-card");
    await expect(cards).toHaveCount(7);
    for (let index = 0; index < 7; index += 1) {
      await expect(cards.nth(index).locator(".platform-admin-excellence-card__score span").first()).not.toHaveText("10/10");
      await expect(cards.nth(index)).toContainText("Owner");
      await expect(cards.nth(index)).toContainText("Date checked");
      await expect(cards.nth(index)).toContainText("Route/file/test coverage");
    }
  });

  test("workflow, visual, marketing, and acceptance evidence slots render without mobile overflow", async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform#excellence", { waitUntil: "networkidle" });

    const workflows = page.getByTestId("phase18-workflow-quality-checklist");
    await expect(workflows).toBeVisible();
    for (const item of ["Signup", "Onboarding", "Business profile", "Locations", "Services", "Public booking", "Trade booking", "Calendar", "Jobs", "Job sheet", "Customers", "Invoices", "Payments", "Communications", "Settings", "Platform admin"]) {
      await expect(workflows).toContainText(item);
    }
    await expect(workflows).toContainText("clear next action");
    await expect(workflows).toContainText("mobile safe");
    await expect(workflows).toContainText("command palette");

    await expect(page.getByTestId("phase18-visual-polish-evidence")).toContainText("Mobile viewport");
    await expect(page.getByTestId("phase18-visual-polish-evidence")).toContainText("no horizontal overflow");
    await expect(page.getByTestId("phase18-marketing-evidence")).toContainText("No fake testimonials");
    await expect(page.getByTestId("phase18-real-world-acceptance")).toContainText("Moderated usability study: not entered.");
    await expect(page.getByTestId("phase18-real-world-acceptance")).toContainText("Live Stripe deposit/refund canary: manual only");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  });

  test("tracked evidence file blocks unsupported claims and does not expose secrets", async ({ request }) => {
    const doc = fs.readFileSync(evidenceDoc, "utf8");
    expect(doc).toContain("Independent security assessment: not attached.");
    expect(doc).toContain("Production Web Vitals evidence: not attached.");
    expect(doc).toContain("Do not fake uptime, customers, reviews, revenue, AI, provider readiness");
    expect(doc).toContain("Do not route tenant customer money through MyTitan billing Stripe.");
    expect(doc).toContain("Do not mutate Stripe products or prices during readiness checks.");
    expect(doc).not.toMatch(/sk_(live|test)_[A-Za-z0-9]+/);
    expect(doc).not.toMatch(/pk_(live|test)_[A-Za-z0-9]+/);
    expect(doc).not.toMatch(/whsec_[A-Za-z0-9]+/);

    const token = await apiLogin(request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    const revenue = await requestLocalApi(request, "/admin/platform/revenue", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revenue.ok()).toBeTruthy();
    const body = await revenue.json();
    expect(body?.totals?.activePaidWorkspaces).toBe(0);
    expect(JSON.stringify(body?.totals?.actualMonthlyRecurringRevenueByCurrency || [])).toContain("\"amountCents\":0");
    expect(body?.totals?.revenueSourceLabels).toContain("Tenant customer payments excluded");
  });

  test("external uptime monitor truth state stays not configured unless real monitor details are declared", async () => {
    const output = runScript("./scripts/external-monitoring-status.sh", {
      MYTITAN_EXTERNAL_UPTIME_MONITOR_NAME: "",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_URL: "",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_PROVIDER: "",
      MYTITAN_EXTERNAL_UPTIME_MONITOR_STATE: "",
    });
    expect(output).toContain("EXTERNAL_MONITOR_STATUS:not_configured");
    expect(output).toContain("No external uptime monitor is declared");
    expect(output).not.toContain("99.9%");
    expect(output).not.toMatch(/sk_(live|test)_/);
    expect(output).not.toMatch(/whsec_/);
  });
});
