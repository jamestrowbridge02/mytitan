import { expect, test } from "@playwright/test";
import { fixtureRefs, hasDashboardAuth, installApiProxy, loginAs } from "./utils";

test.describe("guided job form draft persistence", () => {
  test.skip(!hasDashboardAuth(), "Seed the E2E fixtures or provide dashboard credentials before running authenticated workflow tests.");

  function guidedInput(page: any, label: string) {
    return page
      .locator("label.jobs-new-label")
      .filter({ hasText: label })
      .locator("xpath=following-sibling::*[1][self::input or self::select or self::textarea]");
  }

  async function stubDraftFetch(
    page: any,
    mode: "delay-success" | "fail",
    delayMs = 0,
  ) {
    await page.addInitScript(
      ({ nextMode, nextDelayMs }) => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string"
            ? input
            : input instanceof URL
            ? input.toString()
            : input.url;
          if (!url.includes("/drafts/jobs")) {
            return originalFetch(input, init);
          }
          if (nextDelayMs > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, nextDelayMs));
          }
          if (nextMode === "fail") {
            return new Response(JSON.stringify({ message: "Draft save failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return originalFetch(input, init);
        };
      },
      { nextMode: mode, nextDelayMs: delayMs },
    );
  }

  test("save and exit persists the guided job draft to the server and resumes it on return", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.dispatcherEmail, fixtureRefs.dispatcherPassword);
    await stubDraftFetch(page, "delay-success", 800);

    await page.goto("/dashboard/jobs/new?guided=1", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Save and exit" })).toBeVisible();

    await guidedInput(page, "Job reference").fill("E2E-GUIDED-SAVE-001");
    const saveExit = page.getByRole("button", { name: "Save and exit" });
    await saveExit.click();
    await page.waitForTimeout(150);
    expect(page.url()).toMatch(/\/dashboard\/jobs\/new\?guided=1/);
    await expect(page.getByTestId("jobs-guided-nav-top")).toContainText(/saving draft/i);
    await expect(page).toHaveURL(/\/dashboard$/);

    const token = await page.evaluate(() => window.localStorage.getItem("mytitan_token"));
    expect(token).toBeTruthy();

    const serverDraft = await request.get("http://127.0.0.1:3000/drafts/jobs/WHEELS", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(serverDraft.ok()).toBeTruthy();
    const draftJson = await serverDraft.json();
    expect(draftJson?.payload?.formData?.jobReference).toBe("E2E-GUIDED-SAVE-001");

    await page.goto("/dashboard/jobs/new?guided=1", { waitUntil: "networkidle" });
    await expect(page.getByText("Resume your last saved job?")).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(guidedInput(page, "Job reference")).toHaveValue("E2E-GUIDED-SAVE-001");
  });

  test("draft status reports failure when autosave cannot reach the draft API", async ({ page, request }) => {
    await installApiProxy(page, request);
    await loginAs(page, request, fixtureRefs.dispatcherEmail, fixtureRefs.dispatcherPassword);
    await stubDraftFetch(page, "fail");

    await page.goto("/dashboard/jobs/new?guided=1", { waitUntil: "networkidle" });
    await guidedInput(page, "Job reference").fill("E2E-GUIDED-ERROR-001");
    await expect(page.getByTestId("jobs-guided-nav-top")).toContainText("Draft save failed. Keep this tab open and try again.");
  });
});
