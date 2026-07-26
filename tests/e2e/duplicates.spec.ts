import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("duplicate imports can be listed, selected, and deleted", async ({ page }, testInfo) => {
  const { csv, variant } = fantasyData(testInfo, "Duplicates");
  await openDashboard(page);
  await importCsv(page, csv, `duplicates-${variant}.csv`, /1 file processed · 3 imported/);
  await importCsv(page, csv, `duplicates-repeat-${variant}.csv`, /1 file processed · 0 imported · 3 duplicates separated/);
  await page.getByRole("button", { name: /Duplicates/ }).click();
  await expect(page.getByRole("heading", { name: "Duplicate records" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Transaction filters" })).toHaveCount(0);
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await page.getByLabel("Rows per page").selectOption("10");
  await page.getByLabel("Select all duplicates on this page").check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Delete selected \(3\)/ }).click();
  await expect(page.getByText("No duplicates have been found.")).toBeVisible();
});
