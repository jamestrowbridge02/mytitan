import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("documents and artifacts foundation", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("job artifact area renders seeded metadata", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto(`/dashboard/jobs/${fixtureRefs.invoiceReadyJobId}`);
    await expect(page.getByTestId("artifact-card-job")).toBeVisible();
    await expect(page.getByText(fixtureRefs.seededJobArtifactLabel)).toBeVisible();
  });

  test("customer artifact area renders seeded metadata", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto(`/dashboard/customers/${fixtureRefs.convertibleCustomerSlug}`);
    await expect(page.getByTestId("artifact-card-customer")).toBeVisible();
    await expect(page.getByText(fixtureRefs.seededCustomerArtifactLabel)).toBeVisible();
  });

  test("portal-visible artifact appears in the public portal", async ({ page, request }) => {
    await installApiProxy(page, request);

    await page.goto(`/portal/job/${fixtureRefs.portalToken}`);
    await expect(page.getByTestId("public-portal-documents")).toBeVisible();
    await expect(page.getByText(fixtureRefs.seededPortalArtifactLabel)).toBeVisible();
  });

  test("operators can upload a new job artifact", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");

    await page.goto(`/dashboard/jobs/${fixtureRefs.invoiceReadyJobId}`);
    await page.getByTestId("artifact-label-job").fill("Uploaded E2E operator note");
    await page.getByTestId("artifact-kind-job").selectOption("JOB_ATTACHMENT");
    await page.getByTestId("artifact-file-job").setInputFiles({
      name: "operator-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Operator note for artifact upload coverage.", "utf8"),
    });
    await page.getByTestId("artifact-upload-job").evaluate((element: HTMLButtonElement) => element.click());
    await expect(page.getByText("Uploaded E2E operator note")).toBeVisible();
  });
});
