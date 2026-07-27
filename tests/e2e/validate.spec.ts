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
  await expect(page.locator(".validation-counts")).toContainText("1 Missing in Spendee");
  await expect(page.locator(".validation-counts")).toContainText("1 Only in Spendee");
  const matchedRow = page.locator(".validation-status-badge.matched").locator("xpath=ancestor::tr");
  const missingSpendeeRow = page.locator(".validation-status-badge.missing-app").locator("xpath=ancestor::tr");
  const missingDocumentRow = page.locator(".validation-status-badge.missing-document").locator("xpath=ancestor::tr");
  await expect(matchedRow.getByText("Nebula lunch", { exact: true })).toBeVisible();
  await expect(page.getByText("Comet bakery", { exact: true })).toBeVisible();
  await expect(missingSpendeeRow).toContainText("Comet bakery");
  await expect(missingDocumentRow).toContainText("Dragon bounty");
  await expect(matchedRow.locator(".category-icon")).toBeVisible();
  await expect(matchedRow.locator(".validation-amount")).toHaveClass(/negative/);
  await expect(page.locator(".day-header")).toHaveCount(3);
  await expect(page.getByText("Raw OpenAI response")).toHaveCount(0);
  await expect(page.getByText("DOCUMENT DETAILS")).toHaveCount(0);
  await page.locator(".validation-status-filter summary").click();
  await page.getByLabel("Matching").check();
  await expect(page.locator(".validation-transaction")).toHaveCount(1);
  await expect(page.locator(".validation-transaction")).toContainText("Nebula lunch");
  await page.getByLabel("Missing in Spendee").check();
  await expect(page.locator(".validation-transaction")).toHaveCount(2);
  await page.getByLabel("Matching").uncheck();
  await page.getByLabel("Missing in Spendee").uncheck();
  await expect(page.locator(".validation-transaction")).toHaveCount(3);

  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "Blacklist Comet bakery" }).click();
  await expect(page.locator(".validation-counts")).toContainText("0 Missing in Spendee");
  await page.getByRole("button", { name: "Validation settings" }).click();
  const settings = page.getByRole("dialog", { name: "Ignored descriptions" });
  await expect(settings.getByText("Comet bakery")).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await settings.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".validation-counts")).toContainText("1 Missing in Spendee");
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Moon Guild Card Statement" })).toBeVisible();
  await expect(page.getByText("Moon Guild Card Statement").first()).toBeVisible();
});
