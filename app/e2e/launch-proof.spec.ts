import { expect, test } from "@playwright/test";
import { fixtureRefs, loginAs } from "./utils";

test.describe("launch proof readiness", () => {
  test("Launch Control exposes safe live canary, Wheel A&R pilot, onboarding, uptime, and release proof", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/dashboard/settings/launch-control", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Detailed checks" }).click();

    const canary = page.getByTestId("launch-proof-live-payment-canary");
    await expect(canary).toBeVisible();
    await expect(canary).toContainText("never creates a charge");
    await expect(canary).toContainText("Tenant Stripe connected");
    await expect(canary).toContainText("Refund state updated");
    await expect(canary).toContainText("no MyTitan billing Stripe fallback will be used");
    await expect(canary).not.toContainText(/auto-charge|automatic charge/i);
    await expect(page.getByTestId("launch-canary-record-button")).toBeDisabled();
    await page.getByTestId("launch-canary-explicit-confirmation").check();
    await expect(page.getByTestId("launch-canary-record-button")).toBeEnabled();

    const pilot = page.getByTestId("launch-proof-wheel-pilot");
    await expect(pilot).toContainText("Wheel A&R pilot acceptance");
    for (const item of [
      "Public booking",
      "Trade booking",
      "Custom booking fields",
      "Weekly availability",
      "Deposit and payment state",
      "Job conversion",
      "Job sheet",
      "Photos, signature, and evidence",
      "Invoice",
      "Customer portal",
      "Trade portal",
      "Numbering",
      "Archive period",
    ]) {
      await expect(pilot).toContainText(item);
    }

    const onboarding = page.getByTestId("launch-proof-onboarding-mobile");
    for (const item of ["Business profile", "Logo and branding", "Location", "Service folder and service", "Public booking link", "Payments", "First booking"]) {
      await expect(onboarding).toContainText(item);
    }
    for (const item of ["Job sheet", "Before and after media upload", "Signature", "Weak-signal recovery", "No horizontal overflow"]) {
      await expect(onboarding).toContainText(item);
    }

    const uptime = page.getByTestId("launch-proof-uptime-monitor");
    await expect(uptime).toContainText("External uptime monitor");
    await expect(uptime).toContainText(/not configured|configured|healthy|degraded|verifying/i);
    await expect(uptime.getByRole("link", { name: "Configure monitor" })).toHaveAttribute("href", "/dashboard/settings/operations");

    const release = page.getByTestId("launch-proof-release-discipline");
    await expect(release).toContainText("v1.0.0-clean");
    await expect(release).toContainText("446 passed, 0 failed, 0 skipped");
    await expect(release).toContainText("Rollback note");
  });

  test("guided setup first screen has one direct action for each first-user onboarding step", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.workspaceAdminEmail, fixtureRefs.workspaceAdminPassword);
    await page.goto("/dashboard/setup-wizard", { waitUntil: "networkidle" });

    const wizard = page.getByTestId("phase6-onboarding-wizard");
    for (const item of [
      "Business profile",
      "Logo and branding",
      "Location",
      "Service folder and service",
      "Weekly availability",
      "Public booking link",
      "Customer fields",
      "Payments",
      "Invoices",
      "First booking",
    ]) {
      await expect(wizard).toContainText(item);
    }
    expect(await wizard.getByText("Open action").count()).toBeGreaterThanOrEqual(10);
  });

  test("Platform Autopilot exposes support playbooks with safe checks, safe repair, escalation, and audit action", async ({ page, request }) => {
    await loginAs(page, request, fixtureRefs.platformAdminEmail, fixtureRefs.platformAdminPassword);
    await page.goto("/platform/autopilot", { waitUntil: "networkidle" });

    const playbooks = page.getByTestId("autopilot-support-playbooks");
    await expect(playbooks).toBeVisible();
    for (const item of [
      "Stripe setup failure",
      "Email delivery failure",
      "Booking not visible",
      "Calendar not updating",
      "Upload failure",
      "Tenant onboarding help",
      "Invoice or payment issue",
    ]) {
      await expect(playbooks).toContainText(item);
    }
    await expect(playbooks).toContainText("Safe checks");
    await expect(playbooks).toContainText("Safe repair");
    await expect(playbooks).toContainText("Escalation");
    await expect(playbooks.getByRole("button", { name: "Audit action" })).toHaveCount(7);
  });

  test("marketing pages avoid unsupported launch claims and invented social proof", async ({ page }) => {
    for (const path of ["/", "/pricing", "/signup"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("body")).not.toContainText(/99\.9% uptime|award-winning AI|trusted by \d+|guaranteed revenue|instant live payments/i);
    }
  });
});
