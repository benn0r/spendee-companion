import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const apiKey = "fantasy-e2e-api-key";
const basicAuth = {
  username: "fantasy-e2e-user",
  password: "fantasy-e2e-password",
};
const basicAuthorization = `Basic ${Buffer.from(
  `${basicAuth.username}:${basicAuth.password}`,
  "utf8",
).toString("base64")}`;
const databasePath = "/tmp/spendee-playwright-fantasy.db";
const actualMockDataPath = "/tmp/spendee-playwright-fantasy-actual.json";
const receiptsPath = "/tmp/spendee-playwright-receipts";
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION_BUILD === "1";
const validationMock = JSON.stringify({
  title: "Moon Guild Card Statement",
  printDate: "2026-07-14",
  issuer: "Moon Guild Bank",
  accountReference: "•• 4242",
  metadata: { statementType: "Card statement" },
  transactions: [
    {
      date: "2026-07-01",
      description: "Nebula lunch",
      amount: -24,
      currency: "CHF",
    },
    {
      date: "2026-07-03",
      description: "Comet bakery",
      amount: -18,
      currency: "CHF",
    },
  ],
});
const receiptMock = JSON.stringify({
  merchant: "Cosmic Market",
  date: "2026-08-12",
  amount: -18,
  currency: "CHF",
  category: "style-audit-category",
  notes: "Moonberry provisions",
  tags: ["fantasy-tag-cosmic"],
  items: [
    {
      description: "Moonberry provisions",
      quantity: 1,
      unitAmount: -18,
      totalAmount: -18,
      category: "style-audit-category",
    },
  ],
  splits: [],
  confidence: 0.96,
});

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    extraHTTPHeaders: { Authorization: basicAuthorization },
    httpCredentials: basicAuth,
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
      SPENDEE_API_KEY: apiKey,
      SPENDEE_BASIC_AUTH_USERNAME: basicAuth.username,
      SPENDEE_BASIC_AUTH_PASSWORD: basicAuth.password,
      ACTUAL_MOCK_DATA_PATH: actualMockDataPath,
      HOSTNAME: "127.0.0.1",
      PLAYWRIGHT_USE_PRODUCTION_BUILD: useProductionBuild ? "1" : "0",
      PORT: String(port),
      SQLITE_PATH: databasePath,
      RECEIPTS_DIR: receiptsPath,
      RECEIPT_BACKGROUND_IMMEDIATE: "1",
      OPENAI_RECEIPT_MOCK: receiptMock,
      OPENAI_VALIDATION_MOCK: validationMock,
      VALIDATION_THUMBNAIL_MOCK_BASE64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}/favicon-32.png`,
  },
});
