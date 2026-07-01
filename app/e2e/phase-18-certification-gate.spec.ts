import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { expect, test } from "@playwright/test";
import { fixtureRefs, loginAs, requestLocalApi } from "./utils";

const repoRoot = path.join(__dirname, "..", "..");
const evidenceDoc = path.join(repoRoot, "docs/audit/phase-18-evidence-based-certification-gate.md");
const phase19Doc = path.join(repoRoot, "docs/audit/phase-19-engineering-and-product-excellence.md");

function runScript(script: string, env: Record<string, string | undefined> = {}, args: string[] = []) {
  return execFileSync("bash", [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

async function apiLogin(request: any, email: string, password: string) {
  const response = await request.post(`${process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3000"}/auth/login`, {
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
    await expect(scorecard).toContainText("Engineering Excellence");
    await expect(scorecard).toContainText("Product Excellence");
    await expect(scorecard).toContainText("Evidence attached");
    await expect(scorecard).toContainText("Missing evidence");
    await expect(scorecard).toContainText("Evidence state");
    await expect(scorecard).toContainText("10/10 gate");
    await expect(scorecard).toContainText("Blocked while critical evidence is missing");
    await expect(scorecard).toContainText("Independent security assessment: not attached.");
    await expect(scorecard).toContainText("Production Web Vitals evidence: not attached.");
    await expect(scorecard).toContainText("External uptime monitor: not_configured");
    await expect(scorecard).toContainText("Typecheck evidence");
    await expect(scorecard).toContainText("Bundle budgets");
    await expect(scorecard).toContainText("API contracts");
    await expect(scorecard).toContainText("Architecture docs");
    await expect(scorecard).toContainText("release-evidence");
    await expect(page.getByTestId("phase19-product-excellence-scorecard")).toContainText("Not proven");
    await expect(page.getByTestId("phase19-performance-evidence-dashboard")).toContainText("Core Web Vitals");
    await expect(page.getByTestId("phase19-performance-evidence-dashboard")).toContainText("INP, LCP, and CLS");

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
    const phase19 = fs.readFileSync(phase19Doc, "utf8");
    expect(doc).toContain("Independent security assessment: not attached.");
    expect(doc).toContain("Production Web Vitals evidence: not attached.");
    expect(doc).toContain("Do not fake uptime, customers, reviews, revenue, AI, provider readiness");
    expect(doc).toContain("Do not route tenant customer money through MyTitan billing Stripe.");
    expect(doc).toContain("Do not mutate Stripe products or prices during readiness checks.");
    expect(phase19).toContain("Engineering Excellence is measured only from evidence MyTitan can control");
    expect(phase19).toContain("Product Excellence is measured only from real-world operational evidence");
    expect(phase19).toContain("It cannot reach 10/10 from local automation");
    expect(phase19).not.toMatch(/sk_(live|test)_[A-Za-z0-9]+/);
    expect(phase19).not.toMatch(/pk_(live|test)_[A-Za-z0-9]+/);
    expect(phase19).not.toMatch(/whsec_[A-Za-z0-9]+/);
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

  test("phase 19 evidence commands create truthful slots without secrets", async () => {
    const tempEvidenceDir = "/tmp/mytitan-phase19-e2e-evidence";
    const tempArchitectureDir = "/tmp/mytitan-phase19-e2e-architecture";
    const scripts = [
      "./scripts/check-bundle-budgets.sh",
      "./scripts/collect-screenshot-baseline.sh",
      "./scripts/generate-local-lighthouse-evidence.sh",
      "./scripts/run-accessibility-evidence.sh",
      "./scripts/collect-api-contract-evidence.sh",
    ];

    for (const script of scripts) {
      const output = runScript(script, { MYTITAN_EVIDENCE_DIR: tempEvidenceDir });
      expect(output).not.toMatch(/sk_(live|test)_/);
      expect(output).not.toMatch(/whsec_/);
    }
    const architectureOutput = runScript("./scripts/generate-architecture-docs.sh", { MYTITAN_ARCHITECTURE_DOCS_DIR: tempArchitectureDir });
    expect(architectureOutput).not.toMatch(/sk_(live|test)_/);
    expect(architectureOutput).not.toMatch(/whsec_/);

    const bundle = fs.readFileSync(path.join(tempEvidenceDir, "bundle/latest.json"), "utf8");
    const screenshots = fs.readFileSync(path.join(tempEvidenceDir, "screenshots/manifest.json"), "utf8");
    const lighthouse = fs.readFileSync(path.join(tempEvidenceDir, "lighthouse/latest.json"), "utf8");
    const accessibility = fs.readFileSync(path.join(tempEvidenceDir, "accessibility/latest.json"), "utf8");
    const apiContract = fs.readFileSync(path.join(tempEvidenceDir, "api-contract/latest.json"), "utf8");
    const architectureManifest = fs.readFileSync(path.join(tempArchitectureDir, "manifest.md"), "utf8");
    const packageOutput = runScript("./scripts/create-release-evidence-package.sh", {
      MYTITAN_EVIDENCE_DIR: tempEvidenceDir,
      MYTITAN_ARCHITECTURE_DOCS_DIR: tempArchitectureDir,
    }, ["phase19-e2e"]);
    const packageDir = path.join(repoRoot, "release-evidence/phase19-e2e");
    const packageManifest = fs.readFileSync(path.join(packageDir, "manifest.json"), "utf8");
    const scorecardSummary = fs.readFileSync(path.join(packageDir, "scorecard-summary.json"), "utf8");
    const stableSuiteSlot = fs.readFileSync(path.join(packageDir, "logs/stable-suite.log"), "utf8");

    expect(bundle).toContain("overallStatus");
    expect(screenshots).toContain("public-booking");
    expect(screenshots).toContain("tenant-360");
    expect(lighthouse).toContain("\"productionWebVitalsClaimed\": false");
    expect(accessibility).toContain("keyboard navigation");
    expect(apiContract).toContain("tenant isolation endpoint checks");
    expect(architectureManifest).toContain("Generated Architecture Manifest");
    expect(packageOutput).toContain("SECRET_SCAN_STATUS:pass");
    expect(packageManifest).toContain("scorecardSummary");
    expect(scorecardSummary).toContain("\"productExcellence\"");
    expect(scorecardSummary).toContain("\"tenOutOfTenBlocked\": true");
    expect(stableSuiteSlot).toContain("needs_evidence");
    expect(packageManifest).not.toMatch(/sk_(live|test)_[A-Za-z0-9]+/);
    expect(scorecardSummary).not.toMatch(/whsec_[A-Za-z0-9]+/);
  });
});
