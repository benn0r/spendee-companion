import { expect, test, type Page } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

async function uploadMockStatement(page: Page, wallet: string, filename: string) {
  const historyEntries = page.locator(".validation-history > button");
  const previousCount = await historyEntries.count();
  await page.getByRole("button", { name: "Upload document" }).click();
  const dialog = page.getByRole("dialog", { name: "Upload document" });
  await dialog.getByLabel("Wallet").selectOption(wallet);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 fantasy statement without personal data"),
  });
  await expect(dialog).toBeHidden();
  await expect(historyEntries).toHaveCount(previousCount + 1);
  const newest = historyEntries.first();
  await expect(newest).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Moon Guild Card Statement" })).toBeVisible();
  const id = Number(await newest.getAttribute("data-validation-id"));
  await expect(page).toHaveURL(new RegExp(`/validate\\?validation=${id}$`));
  return id;
}

test("validates a PDF against a wallet and persists the mocked OpenAI result", async ({ page }, testInfo) => {
  const { csv, wallet, variant } = fantasyData(testInfo, "Document validation");
  await openDashboard(page);
  await importCsv(page, csv, `validation-${variant}.csv`, /3 imported/);
  await page.getByRole("link", { name: "Validate" }).click();
  await expect(page.getByRole("heading", { name: "Validate" })).toBeVisible();

  await uploadMockStatement(page, wallet, "moon-guild-statement.pdf");
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

test("links matched transactions to their exact validation and document description", async ({ page }, testInfo) => {
  const { csv, wallet, variant } = fantasyData(testInfo, "Validation transaction link");
  await openDashboard(page);
  await importCsv(page, csv, `validation-link-${variant}.csv`, /3 imported/);
  await page.getByRole("link", { name: "Validate" }).click();

  const matchedValidationId = await uploadMockStatement(page, wallet, "matched-statement.pdf");
  const newerValidationId = await uploadMockStatement(page, `Cloud Vault ${variant}`, "newer-unmatched-statement.pdf");
  expect(newerValidationId).not.toBe(matchedValidationId);

  await page.getByRole("link", { name: "Transactions" }).click();
  const transactionRow = page.getByRole("row").filter({ hasText: `Nebula lunch ${variant}` });
  const validationLink = transactionRow.getByRole("link", { name: "Open validation Moon Guild Card Statement" });
  const descriptionLine = transactionRow.locator(".transaction-description-line");
  await expect(descriptionLine).toContainText(`Nebula lunch ${variant}`);
  await expect(descriptionLine).toContainText("Nebula lunch");
  await expect(transactionRow.locator(".transaction-validation-description")).toHaveText("Nebula lunch");
  await expect(validationLink).toHaveAttribute("href", `/validate?validation=${matchedValidationId}`);
  await expect(validationLink).toHaveText("↗");
  await expect(transactionRow.getByText("Statement:", { exact: true })).toHaveCount(0);
  await expect(transactionRow.getByText("View validation", { exact: true })).toHaveCount(0);

  const originalId = (await (await page.request.get("/api/transactions?pageSize=100")).json()).rows
    .find((row: { note: string }) => row.note === `Nebula lunch ${variant}`).id;
  const matchedWalletSnapshot = csv.split("\n").slice(0, 2).join("\n");
  await importCsv(
    page,
    matchedWalletSnapshot,
    `validation-link-full-reimport-${variant}.csv`,
    /1 file processed · 1 imported · 0 duplicates separated · 2 previous transactions replaced/,
    { fullImport: true },
  );
  const reimportedId = (await (await page.request.get("/api/transactions?pageSize=100")).json()).rows
    .find((row: { note: string }) => row.note === `Nebula lunch ${variant}`).id;
  expect(reimportedId).not.toBe(originalId);
  await expect(transactionRow.locator(".transaction-validation-description")).toHaveText("Nebula lunch");
  await expect(validationLink).toHaveAttribute("href", `/validate?validation=${matchedValidationId}`);

  await page.reload();
  await expect(transactionRow.locator(".transaction-validation-description")).toHaveText("Nebula lunch");
  await expect(validationLink).toHaveAttribute("href", `/validate?validation=${matchedValidationId}`);

  await validationLink.click();
  await expect(page).toHaveURL(new RegExp(`/validate\\?validation=${matchedValidationId}$`));
  await expect(page.locator('.validation-history button[aria-pressed="true"]')).toHaveAttribute("data-validation-id", String(matchedValidationId));
  await expect(page.getByRole("heading", { name: "Moon Guild Card Statement" })).toBeVisible();

  await page.reload();
  await expect(page.locator('.validation-history button[aria-pressed="true"]')).toHaveAttribute("data-validation-id", String(matchedValidationId));
});
