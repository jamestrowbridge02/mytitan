import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3101";
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : [["list"]],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useExistingServer
    ? undefined
    : {
        command:
          "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 " +
          "NEXT_PUBLIC_MYTITAN_DISABLE_SSE=1 " +
          "NEXT_PUBLIC_MYTITAN_FEATURE_MARKETPLACE=1 " +
          "NEXT_PUBLIC_MYTITAN_FEATURE_COMMAND_CENTRE_V2=1 " +
          "NEXT_PUBLIC_MYTITAN_FEATURE_AUTOMATIONS_V1=1 " +
          "NEXT_PUBLIC_MYTITAN_FEATURE_PORTAL_POLISH_V1=1 " +
          "npm run dev -- --hostname 127.0.0.1 --port 3101",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      },
  globalSetup: "./e2e/global-setup.ts",
});
