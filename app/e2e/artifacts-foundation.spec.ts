import { expect, test } from "@playwright/test";
import { validateUploadFile } from "../lib/upload-policy";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs, requestLocalApi } from "./utils";

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
    await expect(page.getByTestId("public-portal-documents").getByText(fixtureRefs.seededPortalArtifactLabel)).toBeVisible();
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
    await page.getByTestId("artifact-upload-job").click();
    await expect(page.getByTestId("artifact-card-job")).toContainText("Uploaded E2E operator note");
  });

  test("client upload policy rejects oversized images before upload", () => {
    expect(validateUploadFile({
      name: "oversized-job-photo.jpg",
      type: "image/jpeg",
      size: 25 * 1024 * 1024 + 1,
    } as File)).toContain("This file is too large. Maximum allowed is 25 MB for this file type.");
  });

  test("API returns structured 413 JSON for an oversized image", async ({ page, request }) => {
    const token = await loginAs(page, request, "e2e.operator@mytitan.local", "MyTitanE2E!2026");
    const response = await requestLocalApi(
      request,
      `/artifacts/entities/job/${fixtureRefs.invoiceReadyJobId}/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          kind: "BEFORE_PHOTO",
          label: "Oversized API photo",
          file: {
            name: "oversized-api-photo.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
          },
        },
      },
    );
    expect(response.status()).toBe(413);
    expect(await response.json()).toEqual(expect.objectContaining({
      statusCode: 413,
      code: "UPLOAD_TOO_LARGE",
      maxSize: "25 MB",
    }));
  });
});
