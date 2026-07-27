import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("validates a PDF against a wallet and persists the mocked OpenAI result", async ({ page }, testInfo) => {
  const { csv, wallet, variant } = fantasyData(testInfo, "Document validation");
  await openDashboard(page);
  await importCsv(page, csv, `validation-${variant}.csv`, /3 imported/);
  await page.getByRole("link", { name: "Validate" }).click();
  await expect(page.getByRole("heading", { name: "Validate" })).toBeVisible();

  await page.getByRole("button", { name: "Upload document" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload document" });
  await dialog.getByLabel("Wallet").selectOption(wallet);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "moon-guild-statement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fantasy statement without personal data"),
  });
  await expect(page.getByRole("heading", { name: "Moon Guild Card Statement" })).toBeVisible();
  await expect(page.locator(".validation-counts")).toContainText("1 Matching");
  await expect(page.locator(".validation-counts")).toContainText("1 Missing in app");
  await expect(page.locator(".validation-counts")).toContainText("1 Missing in document");
  await expect(page.locator(".validation-transaction.matched").getByText("Nebula lunch", { exact: true })).toBeVisible();
  await expect(page.getByText("Comet bakery", { exact: true })).toBeVisible();
  await expect(page.locator(".validation-transaction.missing-app")).toContainText("Comet bakery");
  await expect(page.locator(".validation-transaction.missing-document")).toContainText("Dragon bounty");
  await expect(page.locator(".day-header")).toHaveCount(3);
  await page.getByText("Raw OpenAI response").click();
  await expect(page.locator(".raw-response pre")).toContainText('"mocked": true');

  await page.reload();
  await expect(page.getByRole("heading", { name: "Moon Guild Card Statement" })).toBeVisible();
  await expect(page.getByText("Moon Guild Card Statement").first()).toBeVisible();
});
