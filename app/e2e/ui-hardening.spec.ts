import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("ui hardening regressions", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("settings tabs remain responsive in the light shell", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Tenant Settings" })).toBeVisible();

    await page.getByTestId("settings-tab-workflow").click();
    await expect(page.getByTestId("settings-workflow-panel")).toBeVisible();

    await page.getByTestId("settings-tab-branding").click();
    await expect(page.locator("input.settings-premium-input").first()).toBeVisible();
    await expect(page.getByTestId("settings-save-button")).toBeVisible();
  });

  test("jobs media and signature controls remain usable", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto("/dashboard/jobs/new");
    await expect(page.getByRole("heading", { name: "New job" })).toBeVisible();

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

    await expect(page.getByTestId("jobs-signature-pad-technician")).toBeVisible();
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
});
