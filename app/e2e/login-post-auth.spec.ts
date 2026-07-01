import fs from "fs";
import path from "path";
import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, fixtureRefs, installApiProxy, loginAs } from "./utils";

function resolvePublicDemoFlag() {
  const direct = String(process.env.NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO || "").trim().toLowerCase();
  if (["on", "true", "1", "off", "false", "0"].includes(direct)) {
    return ["on", "true", "1"].includes(direct);
  }
  try {
    const envPath = path.join(__dirname, "..", "..", ".env");
    const envRaw = fs.readFileSync(envPath, "utf8");
    const match = envRaw.match(/^NEXT_PUBLIC_MYTITAN_FEATURE_PUBLIC_DEMO=(.+)$/m);
    const normalized = String(match?.[1] || "").trim().toLowerCase();
    return ["on", "true", "1"].includes(normalized);
  } catch {
    return false;
  }
}

const publicDemoEnabled = resolvePublicDemoFlag();

test.describe("login post-auth stability", () => {
  test("installed-app start route stays reachable and app manifest stays host-safe", async ({ page, request }) => {
    await installApiProxy(page, request);

    const manifestResponse = await request.get(`${process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001"}/site.webmanifest`);
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(String(manifest?.start_url || "")).toBe("/");
    expect(String(manifest?.scope || "")).toBe("/");
    expect(JSON.stringify(manifest)).not.toMatch(/localhost|127\.0\.0\.1|0\.0\.0\.0|api:3000|app:3001|marketing:3002/i);

    await page.goto("/");
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
  });

  test("login lands on the first workspace view without a client exception or refresh", async ({ page, request }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    function expectNoPageErrors(label: string) {
      expect(pageErrors, `page errors after ${label}`).toEqual([]);
      pageErrors.length = 0;
    }

    await installApiProxy(page, request);
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByLabel("Email").fill(defaultOperatorEmail);
    await page.getByLabel("Password").fill(defaultOperatorPassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/\/(dashboard(\/command-centre-v2|\/setup-wizard)?|start)$/, { timeout: 15_000 });
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\/command-centre-v2)?$/);
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard");

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Workspace settings", exact: true })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/settings");

    await page.goto("/dashboard/jobs");
    await expect(page.getByRole("heading", { name: /^(Your jobs|Jobs|Work Orders)$/i })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/jobs");

    await page.goto("/dashboard/customers");
    await expect(page.getByRole("heading", { name: /^(Your customers|Customers)$/i }).first()).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/customers");

    await page.goto("/dashboard/setup-wizard");
    await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/setup-wizard");

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: /Track your work in one place|Track your service work/i })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/customer");
  });

  test("returning users with start-here already seen go straight to the dashboard shell", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.addInitScript(() => {
      window.localStorage.setItem("mytitan_start_here_seen_v1", "1");
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill(defaultOperatorEmail);
    await page.getByLabel("Password").fill(defaultOperatorPassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/\/dashboard(\/command-centre-v2)?$/, { timeout: 15_000 });
    await expect(page.getByTestId("start-logout")).toHaveCount(0);
    await expect(page.getByTestId("sidebar-logout")).toBeVisible();
  });

  test("platform admins default to /platform after login but can still open dashboard routes", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixtureRefs.platformAdminEmail);
    await page.getByLabel("Password").fill(fixtureRefs.platformAdminPassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/\/platform$/, { timeout: 15_000 });

    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.getByRole("heading", { name: /Workspace settings|Settings|Access restricted/, exact: false }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Application error|Unhandled Runtime Error|Invalid credentials/i);
  });

  test("technicians land on the technician queue after login", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixtureRefs.technicianEmail);
    await page.getByLabel("Password").fill(fixtureRefs.technicianPassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/\/dashboard\/technician$/, { timeout: 15_000 });
    await expect(page.getByText(/technician queue|assigned jobs|field note/i).first()).toBeVisible();
  });

  test("finance users land on the finance workspace after login", async ({ page, request }) => {
    await installApiProxy(page, request);
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixtureRefs.financeEmail);
    await page.getByLabel("Password").fill(fixtureRefs.financePassword);
    await page.getByRole("button", { name: "Log in" }).click();

    await page.waitForURL(/\/dashboard\/finance$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Money owed" })).toBeVisible();
  });

  test("login page handles demo_token query strings according to the public demo feature flag", async ({ page, request }) => {
    await installApiProxy(page, request);

    await page.goto("/login?demo_token=should-not-be-used");

    if (publicDemoEnabled) {
      await page.waitForURL(/\/(dashboard(\/command-centre-v2|\/setup-wizard)?|start)$/, { timeout: 15_000 });
      await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("mytitan_token"))).toBe("should-not-be-used");
      return;
    }

    await expect(page).toHaveURL(/\/login\?demo_token=should-not-be-used$/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("mytitan_token"))).toBeNull();
  });
});
