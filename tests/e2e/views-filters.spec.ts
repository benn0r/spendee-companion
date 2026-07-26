import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("transaction and category filters work across wallet and category views", async ({ page }, testInfo) => {
  const { category, csv, dates, variant, wallet } = fantasyData(testInfo, "Views");
  await openDashboard(page);
  await importCsv(page, csv, `views-${variant}.csv`, /1 file processed · 3 imported/);
  await page.reload();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();

  const filters = page.getByRole("region", { name: "Transaction filters" });
  await filters.getByLabel("From", { exact: true }).fill(dates[0]);
  await filters.getByLabel("To", { exact: true }).fill(dates[0]);
  const walletFilter = filters.locator("details.filter-multi").filter({ hasText: "Wallets" });
  await walletFilter.locator("summary").click();
  await walletFilter.getByLabel(wallet, { exact: true }).check();
  await walletFilter.locator("summary").click();
  const categoryFilter = filters.locator("details.filter-multi").filter({ hasText: "Categories" });
  await categoryFilter.locator("summary").click();
  await categoryFilter.getByLabel("Search categories").fill(category);
  await categoryFilter.getByLabel(category, { exact: true }).check();
  await categoryFilter.locator("summary").click();
  const labelFilter = filters.locator("details.filter-multi").filter({ hasText: "Labels" });
  await labelFilter.locator("summary").click();
  await labelFilter.getByLabel("Search labels").fill("cosmic");
  await labelFilter.getByLabel("cosmic", { exact: true }).check();
  await labelFilter.locator("summary").click();
  await filters.getByLabel("Amount comparison").selectOption("eq");
  await filters.getByLabel("Amount", { exact: true }).fill("24");
  await filters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await expect(page.getByText(`Dragon bounty ${variant}`)).toHaveCount(0);
  await filters.getByRole("button", { name: "Clear" }).click();

  const dashboardRow = page.getByRole("row").filter({ hasText: `Nebula lunch ${variant}` });
  await dashboardRow.getByRole("link", { name: wallet }).click();
  await expect(page.getByRole("heading", { name: wallet })).toBeVisible();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Transaction filters" })).toHaveCount(0);
  await page.getByLabel("Rows per page").selectOption("10");
  await page.getByRole("button", { name: "Wallet settings" }).click();
  const walletDialog = page.getByRole("dialog", { name: "Wallet settings" });
  const startingAmount = walletDialog.getByLabel("Starting amount in CHF");
  await startingAmount.fill("250");
  await walletDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(walletDialog.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(page.locator(".wallet-balance-summary")).toContainText("346.00");
  await walletDialog.getByRole("button", { name: "Close settings" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: wallet })).toBeVisible();
  await page.getByRole("button", { name: "Wallet settings" }).click();
  await expect(page.getByRole("dialog", { name: "Wallet settings" })
    .getByLabel("Starting amount in CHF")).toHaveValue("250");
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.getByRole("link", { name: "Spendee companion" }).click();
  const categoryRow = page.getByRole("row").filter({ hasText: `Nebula lunch ${variant}` });
  await categoryRow.getByRole("link", { name: category }).click();
  await expect(page.getByRole("heading", { name: category })).toBeVisible();
  await expect(page.getByRole("img", { name: "CHF spending pie chart" })).toBeVisible();
  const categoryFilters = page.getByRole("region", { name: "Transaction filters" });
  await expect(categoryFilters.getByText("Categories", { exact: true })).toHaveCount(0);
  await categoryFilters.getByLabel("From", { exact: true }).fill(dates[1]);
  await categoryFilters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toHaveCount(0);
  await categoryFilters.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await page.getByRole("button", { name: "Category settings" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Category settings" });
  await categoryDialog.locator("label.setting-toggle").getByRole("checkbox").uncheck();
  await categoryDialog.getByRole("button", { name: "Category icon 3", exact: true }).click();
  await categoryDialog.getByLabel("Category color").fill("#7c6ee6");
  await categoryDialog.getByRole("button", { name: "Save settings" }).click();
  await expect(categoryDialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Spending by label" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: category })).toBeVisible();
  await page.getByRole("button", { name: "Category settings" }).click();
  const persistedDialog = page.getByRole("dialog", { name: "Category settings" });
  await expect(persistedDialog.locator("label.setting-toggle").getByRole("checkbox")).not.toBeChecked();
  await expect(persistedDialog.getByRole("button", {
    name: "Category icon 3",
    exact: true,
  })).toHaveClass(/selected/);
  await expect(persistedDialog.getByLabel("Category color")).toHaveValue("#7c6ee6");
});
