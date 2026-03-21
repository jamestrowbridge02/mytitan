import { expect, test } from "@playwright/test";
import { defaultOperatorEmail, defaultOperatorPassword, installApiProxy } from "./utils";

test.describe("login post-auth stability", () => {
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
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/settings");

    await page.goto("/dashboard/jobs");
    await expect(page.getByRole("heading", { name: /^(Jobs|Work Orders)$/ })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/jobs");

    await page.goto("/dashboard/customers");
    await expect(page.getByRole("heading", { name: "Customers", exact: true }).first()).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/customers");

    await page.goto("/dashboard/setup-wizard");
    await expect(page.getByRole("heading", { name: "Guided setup", exact: true })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/dashboard/setup-wizard");

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "Track your service work" })).toBeVisible();
    await expect(page.getByText("Application error: a client-side exception has occurred")).toHaveCount(0);
    expectNoPageErrors("/customer");
  });
});
