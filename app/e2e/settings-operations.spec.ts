import { execFileSync } from "child_process";
import path from "path";
import { expect, test } from "@playwright/test";
import { hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

const baseDir = path.join(__dirname, "..", "..");

test.describe("settings operations readiness", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("workspace settings exposes the grouped settings directory", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });

    await expect(page.getByTestId("settings-directory-grid")).toBeVisible();
    await expect(page.getByTestId("settings-directory-business-details")).toContainText("Business profile");
    await expect(page.getByTestId("settings-directory-email-notifications")).toContainText("Email & Notifications");
    await expect(page.getByTestId("settings-directory-operations-monitoring")).toContainText("Business readiness");
    await expect(page.getByTestId("settings-workspace-layout-card")).toContainText("Workspace layout");
    await expect(page.getByTestId("settings-command-centre-layout-row-recent-updates")).toBeVisible();
    await page.getByTestId("settings-tab-jobs").click();
    await expect(page.getByTestId("settings-job-template-library")).toBeVisible();
    await expect(page.getByTestId("settings-template-marketplace-featured")).toBeVisible();
    await expect(page.getByTestId("settings-template-preview-panel")).toBeVisible();
    await expect(page.getByTestId("settings-job-template-live-preview")).toBeVisible();
    await expect(page.getByTestId("settings-job-template-customer-preview")).toBeVisible();
    await expect(page.getByTestId("settings-submit-template-proposal")).toBeVisible();
    await expect(page.getByTestId("settings-template-marketplace-all")).toContainText("Alloy Wheel Repair & Refurbishment");
    await expect(page.getByTestId("settings-template-marketplace-all")).toContainText("Diamond Cut Wheel Repair");
    await expect(page.getByTestId("settings-template-marketplace-all")).toContainText("Plumbing");
    await expect(page.getByTestId("settings-template-marketplace-all")).toContainText("HVAC");
    await expect(page.getByTestId("settings-template-marketplace-all")).toContainText("Fleet Maintenance");
    await expect(page.locator("body")).not.toContainText("ISO 27001 readiness");
    await expect(page.locator("body")).not.toContainText("webhook-backed granting");
    await expect(page.locator("body")).not.toContainText("npm run summary:dispatch");

    await page.getByTestId("settings-directory-operations-monitoring").click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/operations$/);
    await expect(page.getByTestId("settings-operations-page")).toBeVisible();
  });

  test("settings deep links land on the exact targeted section", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings?tab=jobs&section=template-marketplace", { waitUntil: "networkidle" });

    const target = page.getByTestId("settings-job-template-library");
    await expect(target).toBeVisible();
    await expect(target).toHaveAttribute("data-section-highlighted", "true");
    const box = await target.boundingBox();
    expect(box && box.y).toBeGreaterThan(40);
  });

  test("settings deep links can target a template card and the email channel card", async ({ page, request }) => {
    await installApiProxy(page, request);
    const token = await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    expect(token).toBeTruthy();

    const response = await requestLocalApi(request, "/templates/library", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const library = await response.json();
    const targetTemplateId = String(library?.templates?.[0]?.id || "");
    expect(targetTemplateId).toBeTruthy();

    await page.goto(`/dashboard/settings?section=job-sheet&templateId=${encodeURIComponent(targetTemplateId)}`, { waitUntil: "networkidle" });
    const highlightedTemplate = page.locator('[data-section-highlighted="true"][data-section-key^="template-"]').first();
    await expect(highlightedTemplate).toBeVisible();

    await page.goto("/dashboard/settings?section=notifications&channel=email", { waitUntil: "networkidle" });
    const emailCard = page.getByTestId("settings-workspace-email-card");
    await expect(emailCard).toHaveAttribute("data-section-highlighted", "true");
  });

  test("dashboard owner shortcut cards route somewhere useful", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const billingCard = page.getByTestId("dashboard-owner-shortcut-billing-and-job-packs");
    if (await billingCard.count()) {
      await billingCard.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/dashboard\/billing\?section=job-packs$/);
      const jobPacks = page.getByTestId("billing-job-completion-packs-card");
      await expect(jobPacks).toBeVisible();
      await expect(jobPacks).toHaveAttribute("data-section-highlighted", "true");
      const box = await jobPacks.boundingBox();
      expect(box && box.y).toBeGreaterThan(40);
    }
  });

  test("billing pack deep links land on the exact pack card", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/billing?section=job-packs&pack=50", { waitUntil: "networkidle" });
    const packCard = page.getByTestId("billing-job-pack-primary-job_completion_pack_3");
    await expect(packCard).toBeVisible();
    await expect(packCard).toHaveAttribute("data-section-highlighted", "true");
    const box = await packCard.boundingBox();
    expect(box && box.y).toBeGreaterThan(40);
  });

  test("settings setup journey shows one recommended next action and command-strip cards stay non-interactive", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings", { waitUntil: "networkidle" });
    await expect(page.getByTestId("settings-guided-setup-hub")).toContainText("Recommended next step");
    await expect(page.getByTestId("settings-guided-setup-hub").getByText("Recommended next step")).toHaveCount(1);
    await expect(page.getByTestId("settings-command-strip").locator("a").first()).toBeVisible();
    await expect(page.getByTestId("settings-command-strip").locator(".settings-command-strip__item").first()).not.toHaveAttribute("data-clickable", /true/);
  });

  test("operations readiness renders truthful statuses without leaking secrets", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings/operations", { waitUntil: "networkidle" });

    await expect(page.getByTestId("operations-readiness-table")).toBeVisible();
    await expect(page.getByTestId("operations-readiness-row-summary-scheduler")).toHaveCount(0);
    await expect(page.getByTestId("operations-readiness-row-subscription-pricing")).toContainText(/Ready|Needs setup|Not configured/);
    await expect(page.getByTestId("operations-readiness-row-job-pack-sync")).toContainText(/Ready|Needs setup|Not configured/);
    await expect(page.getByTestId("operations-readiness-row-customer-payment-provider")).toContainText(/Ready|Needs setup|Not configured/);
    await expect(page.getByTestId("operations-readiness-row-backup")).toHaveCount(0);
    await expect(page.getByTestId("operations-readiness-row-external-monitoring")).toHaveCount(0);
    await expect(page.getByTestId("operations-readiness-row-stripe-canary")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Advanced diagnostics" })).toHaveCount(0);
    await expect(page.getByTestId("internal-monitoring-overview")).toHaveCount(0);
    await expect(page.getByTestId("backup-readiness-card")).toHaveCount(0);
    await expect(page.getByTestId("external-monitoring-card")).toHaveCount(0);
    await expect(page.getByTestId("external-monitor-provider-card")).toHaveCount(0);
    await expect(page.getByTestId("operations-alert-row-failed_summary_dispatch")).toHaveCount(0);
    await expect(page.getByTestId("operations-advanced-monitoring")).toHaveCount(0);
    await expect(page.getByTestId("operations-abuse-table")).toHaveCount(0);
    await expect(page.getByTestId("operations-governance-table")).toHaveCount(0);
    await expect(page.getByTestId("integration-rollout-monitoring")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("/opt/mytitan");
    await expect(page.locator("body")).not.toContainText("sudo ");
    await expect(page.locator("body")).not.toContainText("external uptime monitor");
    await expect(page.locator("body")).not.toContainText("sk_live_");
    await expect(page.locator("body")).not.toContainText("sk_test_");
    await expect(page.locator("body")).not.toContainText("smtp://");
  });

  test("production readiness script stays presence-only and Stripe canary refuses unsafe live execution", async () => {
    const readinessOutput = execFileSync("bash", ["./scripts/production-readiness-check.sh"], {
      cwd: baseDir,
      encoding: "utf8",
    });

    expect(readinessOutput).toContain("INTEGRATIONS_ENCRYPTION_KEY");
    expect(readinessOutput).toContain("Summary scheduler");
    expect(readinessOutput).toContain("Public booking rate limit");
    expect(readinessOutput).toContain("Hardcoded Stripe key guard");
    expect(readinessOutput).toContain("Privacy route publication");
    expect(readinessOutput).not.toContain("sk_live_");
    expect(readinessOutput).not.toContain("sk_test_");

    let refusalOutput = "";
    let refusalStatus = 0;
    try {
      execFileSync("bash", ["./scripts/stripe-deposit-refund-canary.sh"], {
        cwd: baseDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error: any) {
      refusalOutput = `${String(error.stdout || "")}${String(error.stderr || "")}`;
      refusalStatus = Number(error.status || 1);
    }

    expect(refusalStatus).toBeGreaterThan(0);
    expect(refusalOutput).toContain("REFUSED:");
    expect(refusalOutput).not.toContain("sk_live_");
    expect(refusalOutput).not.toContain("sk_test_");
  });

  test("job-completion product sync dry-run reports ready, inactive, metadata mismatch, currency mismatch, and missing states safely", async () => {
    const mixedOutput = execFileSync(
      "docker",
      [
        "exec",
        "mytitan_api",
        "/bin/sh",
        "-lc",
        "cd /app && npm run billing:sync-job-products -- --dry-run --mock-file=./scripts/fixtures/stripe-job-products-mock-mixed.json",
      ],
      {
        cwd: baseDir,
        encoding: "utf8",
      },
    );

    if (mixedOutput.includes("JOB_COMPLETION_PACK_SYNC status=setup_needed")) {
      expect(mixedOutput).toContain("STRIPE_SECRET_KEY is set to a publishable key");
      expect(mixedOutput).toContain("job_completion_pack_1 jobs=10 status=missing");
      expect(mixedOutput).toContain("SUMMARY Stripe is not configured");
    } else {
      expect(mixedOutput).toContain("JOB_COMPLETION_PACK_SYNC status=partial");
      expect(mixedOutput).toContain("job_completion_pack_1 jobs=10 status=ready");
      expect(mixedOutput).toContain("job_completion_pack_2 jobs=25 status=job_count_mismatch");
      expect(mixedOutput).toContain("job_completion_pack_3 jobs=50 status=inactive");
      expect(mixedOutput).toContain("job_completion_pack_4 jobs=100 status=currency_mismatch");
      expect(mixedOutput).toContain("job_completion_pack_5 jobs=250 status=missing");
      expect(mixedOutput).toContain("job_completion_pack_6 jobs=500 status=missing");
    }
    expect(mixedOutput).not.toContain("sk_live_");
    expect(mixedOutput).not.toContain("sk_test_");

    const missingOutput = execFileSync(
      "docker",
      [
        "exec",
        "mytitan_api",
        "/bin/sh",
        "-lc",
        "cd /app && npm run billing:sync-job-products -- --dry-run --mock-file=./scripts/fixtures/stripe-job-products-mock-missing.json",
      ],
      {
        cwd: baseDir,
        encoding: "utf8",
      },
    );

    expect(missingOutput).toContain("JOB_COMPLETION_PACK_SYNC status=setup_needed");
    expect(missingOutput).toContain("job_completion_pack_1 jobs=10 status=missing");
    expect(missingOutput).not.toContain("sk_live_");
    expect(missingOutput).not.toContain("sk_test_");

    const priceMismatchOutput = execFileSync(
      "docker",
      [
        "exec",
        "mytitan_api",
        "/bin/sh",
        "-lc",
        "cd /app && npm run billing:sync-job-products -- --dry-run --mock-file=./scripts/fixtures/stripe-job-products-mock-price-mismatch.json",
      ],
      {
        cwd: baseDir,
        encoding: "utf8",
      },
    );

    if (priceMismatchOutput.includes("JOB_COMPLETION_PACK_SYNC status=setup_needed")) {
      expect(priceMismatchOutput).toContain("STRIPE_SECRET_KEY is set to a publishable key");
      expect(priceMismatchOutput).toContain("job_completion_pack_1 jobs=10 status=missing");
      expect(priceMismatchOutput).toContain("SUMMARY Stripe is not configured");
    } else {
      expect(priceMismatchOutput).toContain("JOB_COMPLETION_PACK_SYNC status=partial");
      expect(priceMismatchOutput).toContain('job_completion_pack_1 jobs=10 status=price_mismatch');
      expect(priceMismatchOutput).toContain('price=\"£6.00\"');
    }
    expect(priceMismatchOutput).not.toContain("sk_live_");
    expect(priceMismatchOutput).not.toContain("sk_test_");
  });

  test("subscription price verification dry-run reports ready, mismatch, and setup-needed states safely", async () => {
    const readyOutput = execFileSync(
      "docker",
      [
        "exec",
        "mytitan_api",
        "/bin/sh",
        "-lc",
        "cd /app && STRIPE_SECRET_KEY=sk_test_mock STRIPE_PRICE_SOLE_TRADER_MONTHLY=price_sole_monthly STRIPE_PRICE_SOLE_TRADER_ANNUAL=price_sole_annual STRIPE_PRICE_BUSINESS_MONTHLY=price_business_monthly STRIPE_PRICE_BUSINESS_ANNUAL=price_business_annual STRIPE_PRICE_ENTERPRISE_MONTHLY=price_enterprise_monthly STRIPE_PRICE_ENTERPRISE_ANNUAL=price_enterprise_annual npm run billing:verify-subscription-prices -- --mock-file=./scripts/fixtures/stripe-subscription-prices-mock-ready.json",
      ],
      {
        cwd: baseDir,
        encoding: "utf8",
      },
    );

    expect(readyOutput).toContain("SUBSCRIPTION_PRICE_SYNC status=ready");
    expect(readyOutput).toContain('SOLE_TRADER interval=MONTHLY status=ready expected="£19.00" observed="£19.00"');
    expect(readyOutput).toContain('BUSINESS interval=ANNUAL status=ready expected="£590.00" observed="£590.00"');
    expect(readyOutput).toContain('ENTERPRISE interval=MONTHLY status=ready expected="£159.00" observed="£159.00"');
    expect(readyOutput).not.toContain("sk_live_");
    expect(readyOutput).not.toContain("sk_test_");

    const mismatchOutput = execFileSync(
      "docker",
      [
        "exec",
        "mytitan_api",
        "/bin/sh",
        "-lc",
        "cd /app && STRIPE_SECRET_KEY=sk_test_mock STRIPE_PRICE_SOLE_TRADER_MONTHLY=price_sole_monthly STRIPE_PRICE_SOLE_TRADER_ANNUAL=price_sole_annual STRIPE_PRICE_BUSINESS_MONTHLY=price_business_monthly STRIPE_PRICE_BUSINESS_ANNUAL=price_business_annual STRIPE_PRICE_ENTERPRISE_MONTHLY=price_enterprise_monthly npm run billing:verify-subscription-prices -- --mock-file=./scripts/fixtures/stripe-subscription-prices-mock-mismatch.json",
      ],
      {
        cwd: baseDir,
        encoding: "utf8",
      },
    );

    expect(mismatchOutput).toContain("SUBSCRIPTION_PRICE_SYNC status=mismatch");
    expect(mismatchOutput).toContain('SOLE_TRADER interval=ANNUAL status=mismatch');
    expect(mismatchOutput).toContain('BUSINESS interval=MONTHLY status=mismatch');
    expect(mismatchOutput).toContain('BUSINESS interval=ANNUAL status=mismatch');
    expect(mismatchOutput).toContain('ENTERPRISE interval=MONTHLY status=mismatch');
    expect(mismatchOutput).toContain('ENTERPRISE interval=ANNUAL status=mismatch');
    expect(mismatchOutput).toContain("ACTION ENTERPRISE ANNUAL");
    expect(mismatchOutput).not.toContain("sk_live_");
    expect(mismatchOutput).not.toContain("sk_test_");
  });
});
