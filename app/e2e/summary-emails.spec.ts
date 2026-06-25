import { expect, test, type Page } from "@playwright/test";
import { authFile, hasDashboardAuth, installApiProxy, requestLocalApi } from "./utils";

test.use({ storageState: authFile });

async function getToken(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
  expect(token).toBeTruthy();
  return token as string;
}

test.describe("summary emails", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  test("settings expose summary email controls and dispatch stays honest about system sender readiness", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/dashboard/settings?tab=messages", { waitUntil: "networkidle" });
    const token = await getToken(page);

    const settingsResponse = await requestLocalApi(request, "/tenant/settings", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        businessConfigJson: {
          summaryEmails: {
            enabled: true,
            enabledCadences: ["daily", "weekly"],
            enabledSections: ["bookings", "payments", "failed_sends"],
          },
          operationalAlerts: {
            externalEmailRecipients: ["ops@example.com"],
            enabledCategories: ["failed_summary_dispatch", "failed_payment", "health_degraded"],
          },
          notificationRouting: {
            internalRecipients: [
              {
                email: "ops-summary@example.com",
                label: "Ops summary",
                enabled: true,
                categories: ["payments", "workspace_alerts"],
              },
            ],
          },
        },
      },
    });
    expect(settingsResponse.ok()).toBeTruthy();

    await page.goto("/dashboard/settings?tab=messages", { waitUntil: "networkidle" });
    await expect(page.getByTestId("summary-email-settings-card")).toBeVisible();
    await expect(page.getByTestId("summary-email-enabled")).toBeChecked();
    await expect(page.getByTestId("summary-email-cadence-daily")).toBeChecked();
    await expect(page.getByTestId("summary-email-section-payments")).toBeChecked();
    await expect(page.getByTestId("summary-email-runtime-note")).toContainText(/Summary delivery is enabled|Turn on summary emails/i);
    await expect(page.getByTestId("summary-email-runtime-note")).not.toContainText("npm run");
    await expect(page.getByTestId("ops-alert-status-card")).toContainText(/Automatic owner\/admin recipients/i);
    await expect(page.getByTestId("ops-alert-category-failed_summary_dispatch")).toBeChecked();

    await expect(page.getByTestId("summary-email-preview")).toBeVisible();

    const readinessResponse = await requestLocalApi(request, "/notifications/summaries/readiness", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(readinessResponse.ok()).toBeTruthy();
    const readiness = await readinessResponse.json();
    expect(readiness.settings.enabled).toBe(true);
    expect(readiness.recipientCount).toBeGreaterThan(0);

    const dispatchResponse = await requestLocalApi(request, "/notifications/summaries/dispatch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        cadence: "daily",
        dryRun: true,
      },
    });
    expect(dispatchResponse.ok()).toBeTruthy();
    const preview = await dispatchResponse.json();
    expect(preview.preview?.subject).toMatch(/summary/i);
    expect(preview.preview?.text).toMatch(/Bookings|Payments|Failed sends/i);

    const actualDispatchResponse = await requestLocalApi(request, "/notifications/summaries/dispatch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        cadence: "daily",
        dryRun: false,
      },
    });
    expect(actualDispatchResponse.ok()).toBeTruthy();
    const dispatch = await actualDispatchResponse.json();
    expect(dispatch.preview?.data?.bookings).toBeTruthy();
    expect(Array.isArray(dispatch.recipients)).toBeTruthy();
    expect(dispatch.recipients.length).toBeGreaterThan(0);
    if (dispatch.sender?.canSend === false) {
      expect(dispatch.recipients.some((recipient: any) => recipient.delivered)).toBeFalsy();
      expect(dispatch.recipients.every((recipient: any) => recipient.status !== "sent")).toBeTruthy();
    }

    const opsStatusResponse = await requestLocalApi(request, "/notifications/ops-alerts/status", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(opsStatusResponse.ok()).toBeTruthy();
    const opsStatus = await opsStatusResponse.json();
    expect(typeof opsStatus.ownerAdminRecipientCount).toBe("number");
    expect(opsStatus.extraRecipientCount).toBe(1);
    expect(opsStatus.resolvedRecipientCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(opsStatus.enabledCategories)).toBeTruthy();
    expect(opsStatus.enabledCategories).toContain("failed_summary_dispatch");

    const smokeResponse = await requestLocalApi(request, "/notifications/ops-alerts/smoke", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(smokeResponse.ok()).toBeTruthy();
    const smoke = await smokeResponse.json();
    expect(smoke.ownerAdminRecipientCount).toBeGreaterThanOrEqual(0);
    expect(typeof smoke.extraRecipientCount).toBe("number");
    expect(typeof smoke.resolvedExternalRecipientCount).toBe("number");
    expect(smoke.resolvedExternalRecipientCount).toBeGreaterThanOrEqual(0);
  });
});
