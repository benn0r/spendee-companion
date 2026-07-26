import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const databasePath = "/tmp/spendee-playwright-fantasy.db";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: {
      APP_VERSION: "fantasy-e2e-build",
      SQLITE_PATH: databasePath,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}/api/health`,
  },
});
