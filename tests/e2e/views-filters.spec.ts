import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("transaction and category filters work across wallet and category views", async ({ page }, testInfo) => {
  const { category, csv, variant, wallet } = fantasyData(testInfo, "Views");
  await openDashboard(page);
  await importCsv(page, csv, `views-${variant}.csv`, /1 file processed · 3 imported/);
  await page.reload();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();

  const filters = page.getByRole("region", { name: "Transaction filters" });
  await filters.locator(".filter-date input").nth(0).fill("2026-07-01");
  await filters.locator(".filter-date input").nth(1).fill("2026-07-01");
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

  await page.getByRole("link", { name: wallet }).first().click();
  await expect(page.getByRole("heading", { name: wallet })).toBeVisible();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Transaction filters" })).toHaveCount(0);
  await page.getByLabel("Rows per page").selectOption("10");
  await page.getByRole("button", { name: "Wallet settings" }).click();
  await expect(page.getByLabel("Starting amount in CHF")).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.getByRole("link", { name: "Spendee companion" }).click();
  await page.getByRole("link", { name: category }).first().click();
  await expect(page.getByRole("heading", { name: category })).toBeVisible();
  await expect(page.getByRole("img", { name: "CHF spending pie chart" })).toBeVisible();
  const categoryFilters = page.getByRole("region", { name: "Transaction filters" });
  await expect(categoryFilters.getByText("Categories", { exact: true })).toHaveCount(0);
  await categoryFilters.locator(".filter-date input").nth(0).fill("2026-07-02");
  await categoryFilters.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toHaveCount(0);
  await categoryFilters.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await page.getByRole("button", { name: "Category settings" }).click();
  await expect(page.getByRole("dialog", { name: "Category settings" })).toBeVisible();
});
