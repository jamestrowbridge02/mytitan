import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

function jobInputByLabel(page: any, label: string) {
  return page.locator(
    [
      `input[aria-label="${label}"]`,
      `select[aria-label="${label}"]`,
      `textarea[aria-label="${label}"]`,
      `input[placeholder="${label}"]`,
      `select[placeholder="${label}"]`,
      `textarea[placeholder="${label}"]`,
    ].join(", "),
  ).first().or(
    page
    .locator("label.jobs-new-label")
    .filter({ hasText: label })
    .locator("xpath=following-sibling::*[1][self::input or self::select or self::textarea]"),
  );
}

async function drawSignature(page: any, testId: string) {
  const modalTrigger =
    testId === "jobs-signature-pad-technician"
      ? page.getByTestId("jobs-signature-open-technician")
      : testId === "jobs-signature-pad-customer"
        ? page.getByTestId("jobs-signature-open-customer")
        : null;
  if (modalTrigger) {
    await modalTrigger.click();
    await expect(page.getByTestId("jobs-signature-modal")).toBeVisible();
  }
  const signaturePad = page.getByTestId(testId);
  await expect(signaturePad).toBeVisible();
  await signaturePad.hover();
  await page.mouse.down();
  await page.mouse.move(40, 20);
  await page.mouse.move(120, 50);
  await page.mouse.up();
  if (modalTrigger) {
    await page.getByTestId("jobs-signature-save").click();
    await expect(page.getByTestId("jobs-signature-modal")).toHaveCount(0);
  }
}

async function fillConfiguredFields(page: any) {
  const fields = page.locator('[data-testid^="job-form-field-"]');
  const count = await fields.count();
  for (let index = 0; index < count; index += 1) {
    const field = fields.nth(index);
    const tagName = await field.evaluate((node) => node.tagName.toLowerCase());
    if (tagName === "textarea") {
      await field.fill(`E2E field ${index + 1}`);
      continue;
    }
    if (tagName === "select") {
      const options = field.locator("option");
      const optionCount = await options.count();
      if (optionCount > 1) {
        const value = await options.nth(1).getAttribute("value");
        if (value) await field.selectOption(value);
      }
      continue;
    }
    const inputType = await field.getAttribute("type");
    if (inputType === "checkbox") {
      if (!(await field.isChecked())) await field.check();
      continue;
    }
    if (inputType === "date") {
      await field.fill("2026-04-17");
      continue;
    }
    if (inputType === "number") {
      await field.fill("1");
      continue;
    }
    await field.fill(`E2E field ${index + 1}`);
  }
}

async function ensureStandardJobForm(page: any) {
  const switchButton = page.getByRole("button", { name: "Switch to standard entry" });
  if (await switchButton.count()) {
    await switchButton.click();
  }
}

test.describe("ui hardening regressions", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("login lands in the operator workspace without a first-load client exception and exposes logout", async ({ page, request }) => {
    await installApiProxy(page, request);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e.operator@mytitan.local");
    await page.getByLabel("Password").fill("MyTitanE2E!2026");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/dashboard(\/|$)|\/dashboard\/command-centre-v2|\/start$/);
    await expect(pageErrors).toEqual([]);
    const logoutButton = page.getByTestId("sidebar-logout").or(page.getByTestId("start-logout"));
    await expect(logoutButton).toBeVisible();

    await logoutButton.click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("settings tabs remain responsive in the light shell", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings");
    await expect(page.locator("h1", { hasText: "Settings" })).toBeVisible();

    await page.getByTestId("settings-tab-jobs").click();
    await expect(page.getByTestId("settings-workflow-panel")).toBeVisible();

    await page.getByTestId("settings-tab-general").click();
    await expect(page.locator("input.settings-premium-input").first()).toBeVisible();
    const saveButton = page.getByTestId("settings-save-button");
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();

    const businessName = page.locator("input.settings-premium-input").first();
    await businessName.fill("MyTitan E2E Workspace");
    await expect(saveButton).toBeEnabled();

    await page.getByTestId("settings-tab-jobs").click();
    await expect(page.getByTestId("settings-declaration-text")).toBeVisible();
  });

  test("jobs media and signature controls remain usable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/jobs/new");
    await page.getByTestId("job-form-disclosure-proof").locator("summary").click();
    await expect(page.getByTestId("jobs-before-upload")).toBeVisible();

    await page.getByTestId("jobs-before-upload").setInputFiles({
      name: "before-photo.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-image-content"),
    });
    await page.getByTestId("jobs-torque-upload").setInputFiles({
      name: "torque-proof.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake-video-content"),
    });

    await expect(page.getByText("before-photo.jpg")).toBeVisible();
    await expect(page.getByText("torque-proof.mp4")).toBeVisible();

    await page.getByTestId("jobs-signature-open-technician").click();
    await expect(page.getByTestId("jobs-signature-modal")).toBeVisible();
    const signaturePad = page.getByTestId("jobs-signature-pad-technician");
    await expect(signaturePad).toBeVisible();
    await signaturePad.hover();
    await page.mouse.down();
    await page.mouse.move(40, 20);
    await page.mouse.move(120, 50);
    await page.mouse.up();

    await page.getByRole("button", { name: "Undo" }).first().click();
    await page.mouse.move(10, 10);
    await page.mouse.down();
    await page.mouse.move(90, 40);
    await page.mouse.up();
    await page.getByTestId("jobs-signature-save").click();

    await expect(page.getByTestId("jobs-signature-preview-technician")).toBeVisible();
  });

  test("job form keeps the finish path obvious and reveals secondary help on demand", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/jobs/new");
    await ensureStandardJobForm(page);
    await expect(page.getByTestId("job-form-readiness-card")).toContainText("Before you finish");
    await expect(page.getByTestId("job-form-readiness-card")).toContainText("Still needed");
    await expect(page.getByText("We created this for you. Change it if needed.")).toHaveCount(0);

    const jobReferenceHelp = page.getByRole("button", { name: /show help for job reference/i }).first();
    await jobReferenceHelp.click();
    await expect(page.getByText("We created this for you. Change it if needed.")).toBeVisible();

    await page.getByRole("button", { name: /hide help for job reference/i }).first().click();
    await expect(page.getByText("We created this for you. Change it if needed.")).toHaveCount(0);
  });

  test("job form reduces first-load density and reveals advanced sections intentionally", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/jobs/new");
    await ensureStandardJobForm(page);
    await expect(page.getByTestId("jobs-before-upload")).toBeHidden();
    await expect(jobInputByLabel(page, "Invoice number (optional)")).toBeHidden();

    await page.getByTestId("job-form-disclosure-pricing-advanced").locator("summary").click();
    await expect(jobInputByLabel(page, "Invoice number (optional)")).toBeVisible();

    await page.getByTestId("job-form-disclosure-proof").locator("summary").click();
    await expect(page.getByTestId("jobs-before-upload")).toBeVisible();
  });

  test("job form starts pre-configured and updates readiness from the canonical form state", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/jobs/new");
    await ensureStandardJobForm(page);
    await expect(page.getByTestId("job-form-readiness-card")).toContainText("Waiting");
    await expect(page.getByTestId("job-form-readiness-card")).toContainText("Still needed");

    await jobInputByLabel(page, "Customer or trade name").fill("E2E Fleet");
    await jobInputByLabel(page, "Technician name").fill("Taylor Tech");
    await jobInputByLabel(page, "Service name").fill("Wheel Alignment");
    await jobInputByLabel(page, "Service unit price").fill("125");
    await jobInputByLabel(page, "Service quantity").fill("1");

    const worksheetDisclosure = page.getByTestId("job-form-disclosure-worksheet");
    if (await worksheetDisclosure.count()) {
      const isOpen = await worksheetDisclosure.evaluate((node) => node instanceof HTMLDetailsElement && node.open);
      if (!isOpen) {
        await worksheetDisclosure.locator("summary").click();
      }
      await fillConfiguredFields(page);
    }

    await page.getByTestId("job-form-disclosure-pricing-advanced").locator("summary").click();
    await jobInputByLabel(page, "WhatsApp message").fill("Your service summary is ready to review.");

    await drawSignature(page, "jobs-signature-pad-technician");
    await drawSignature(page, "jobs-signature-pad-customer");

    await expect(page.getByTestId("job-form-readiness-card")).toContainText("Ready");
    await expect(page.getByTestId("job-form-readiness-card")).not.toContainText("Capture technician sign-off.");
  });

  test("public portal signature pad works with pointer events", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto(`/portal/job/${fixtureRefs.portalToken}`);

    const signaturePad = page.getByTestId("public-portal-signature-pad");
    if (await signaturePad.count()) {
      await expect(signaturePad).toBeVisible();
      await signaturePad.hover();
      await page.mouse.down();
      await page.mouse.move(60, 30);
      await page.mouse.move(150, 60);
      await page.mouse.up();
      await expect(signaturePad).toBeVisible();
    } else {
      await expect(page.getByText(/Signed|Signature saved/i).first()).toBeVisible();
    }
  });

  test("key operator surfaces keep primary panels visible and usable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-premium-home")).toBeVisible();
    await expect(page.getByTestId("dashboard-primary-action")).toBeVisible();
    await expect(page.getByTestId("dashboard-priority-action")).toBeVisible();

    await page.goto("/dashboard/jobs");
    await expect(page.getByRole("heading", { name: /Jobs|Work Orders/, exact: true })).toBeVisible();
    await expect(page.locator(".operator-table").first()).toBeVisible();

    await page.goto("/dashboard/command-centre-v2");
    await expect(page.getByRole("heading", { name: "Live work", exact: true })).toBeVisible();
    await expect(page.getByTestId("ccv2-filters-card")).toBeVisible();
    await expect(page.getByTestId("ccv2-work-board")).toBeVisible();

    await page.goto("/dashboard/settings");
    await expect(page.locator("h1", { hasText: "Settings" })).toBeVisible();
    await expect(page.locator(".settings-premium-card").first()).toBeVisible();
  });
});
