import { expect, test } from "@playwright/test";
import { readMetadata } from "./utils";

const metadata = readMetadata();
const portalToken = process.env.PLAYWRIGHT_PUBLIC_PORTAL_TOKEN || metadata.portalToken || "";

test.describe("public portal workflow", () => {
  test.skip(!portalToken, "Set PLAYWRIGHT_PUBLIC_PORTAL_TOKEN or provide dashboard auth credentials so global setup can mint a portal token.");

  test("public portal exposes billing guidance and safe async controls", async ({ page }) => {
    await page.goto(`/portal/job/${portalToken}`);
    await expect(page.getByTestId("public-portal-billing-progress")).toBeVisible();
    await expect(page.getByTestId("public-portal-next-step")).toBeVisible();

    const refreshButton = page.getByTestId("public-portal-refresh-payment");
    if (await refreshButton.count()) {
      await page.route(/\/public\/job\/.+\/payment-status/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.continue();
      }, { times: 1 });
      await refreshButton.click();
      await expect(refreshButton).toBeDisabled();
      await expect(refreshButton).toHaveText(/Refreshing/i);
    } else {
      await expect(page.getByText(/Payments not configured|Payment availability/i)).toBeVisible();
    }
  });
});
