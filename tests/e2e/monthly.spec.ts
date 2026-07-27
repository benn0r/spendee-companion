import { expect, test } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("Monthly columns can merge categories and persist a budget", async ({ page }, testInfo) => {
  const { csv, expenseCategories, monthLabel, variant } = fantasyData(testInfo, "Monthly");
  await openDashboard(page);
  await importCsv(page, csv, `monthly-${variant}.csv`, /1 file processed · 3 imported/);
  await page.getByRole("link", { name: "Monthy" }).click();
  await expect(page.getByRole("heading", { name: "Monthy" })).toBeVisible();
  await page.getByRole("button", { name: "Monthy settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Table columns" });
  await dialog.getByRole("button", { name: "＋ Add column" }).click();
  const newEditor = dialog.getByRole("article", {
    name: "Column settings: New column",
  });
  const columnName = `Cosmic costs ${variant}`;
  await newEditor.getByLabel("Column name").fill(columnName);
  const editor = dialog.getByRole("article", {
    name: `Column settings: ${columnName}`,
  });
  await editor.getByLabel("Monthly budget").fill("30");
  for (const category of expenseCategories) {
    await editor.getByLabel(category, { exact: true }).check();
  }
  await dialog.getByRole("button", { name: "Save columns" }).click();
  await expect(page.getByText("Monthly report columns saved.")).toBeVisible();
  const columnHeader = page.getByRole("columnheader", { name: new RegExp(columnName) });
  await expect(columnHeader).toBeVisible();
  const monthRow = page.getByRole("row").filter({ hasText: monthLabel });
  const columnIndex = await columnHeader.evaluate((element) =>
    Array.from(element.parentElement?.children ?? []).indexOf(element)
  );
  const budgetCell = monthRow.getByRole("cell").nth(columnIndex);
  await expect(budgetCell).toHaveClass(/budget-over/);
  await expect(budgetCell).toContainText("69");

  await page.reload();
  await expect(page.getByRole("columnheader", { name: new RegExp(columnName) })).toBeVisible();
  await page.getByRole("button", { name: "Monthy settings" }).click();
  const savedDialog = page.getByRole("dialog", { name: "Table columns" });
  const savedEditor = savedDialog.getByRole("article", {
    name: `Column settings: ${columnName}`,
  });
  await expect(savedEditor.getByLabel("Monthly budget")).toHaveValue("30");
  for (const category of expenseCategories) {
    await expect(savedEditor.getByLabel(category, { exact: true })).toBeChecked();
  }

  const unsavedName = `Unsaved costs ${variant}`;
  await savedEditor.getByLabel("Column name").fill(unsavedName);
  await savedDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("columnheader", { name: new RegExp(columnName) })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: new RegExp(unsavedName) })).toHaveCount(0);

  await page.getByRole("button", { name: "Monthy settings" }).click();
  const cleanupDialog = page.getByRole("dialog", { name: "Table columns" });
  const persistedEditor = cleanupDialog.getByRole("article", {
    name: `Column settings: ${columnName}`,
  });
  await expect(persistedEditor.getByLabel("Column name")).toHaveValue(columnName);
  await persistedEditor.getByRole("button", { name: `Remove ${columnName}` }).click();
  await cleanupDialog.getByRole("button", { name: "Save columns" }).click();
  await expect(cleanupDialog).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: new RegExp(columnName) })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Monthy" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: new RegExp(columnName) })).toHaveCount(0);
});
