import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const databasePath = "/tmp/spendee-playwright-fantasy.db";
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === "1";
const validationMock = JSON.stringify({
  title: "Moon Guild Card Statement",
  printDate: "2026-07-14",
  issuer: "Moon Guild Bank",
  accountReference: "•• 4242",
  metadata: { statementType: "Card statement" },
  transactions: [
    { date: "2026-07-01", description: "Nebula lunch", amount: -24, currency: "CHF" },
    { date: "2026-07-03", description: "Comet bakery", amount: -18, currency: "CHF" },
  ],
});

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: process.env.CI ? "on" : "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node --import tsx tests/e2e/start-server.ts",
    env: {
      APP_VERSION: "fantasy-e2e-build",
      HOSTNAME: "127.0.0.1",
      PLAYWRIGHT_USE_PRODUCTION_BUILD: useProductionBuild ? "1" : "0",
      PORT: String(port),
      SQLITE_PATH: databasePath,
      OPENAI_VALIDATION_MOCK: validationMock,
      VALIDATION_THUMBNAIL_MOCK_BASE64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}/api/health`,
  },
});
