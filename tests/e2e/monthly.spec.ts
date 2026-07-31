import { expect, test } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("Monthly columns can merge categories and persist a budget", async ({
  page,
}, testInfo) => {
  const { csv, expenseCategories, monthLabel, variant } = fantasyData(
    testInfo,
    "Monthly",
  );
  await openDashboard(page);
  await importCsv(
    page,
    csv,
    `monthly-${variant}.csv`,
    /1 file processed · 3 imported/,
  );
  await page.getByRole("link", { name: "Monthly", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Monthly", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Monthly settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Table columns" });
  const unassignedNotice = dialog.getByRole("status");
  await expect(unassignedNotice).toHaveCount(0);
  for (const category of expenseCategories) {
    const sourceEditor = dialog.getByRole("article", {
      name: `Column settings: ${category}`,
    });
    await sourceEditor.getByLabel(category, { exact: true }).uncheck();
  }
  await expect(unassignedNotice).toBeVisible();
  await expect(unassignedNotice).toContainText("Categories without a column");
  for (const category of expenseCategories) {
    await expect(unassignedNotice).toContainText(category);
  }
  for (const category of expenseCategories) {
    const sourceEditor = dialog.getByRole("article", {
      name: `Column settings: ${category}`,
    });
    await sourceEditor.getByLabel(category, { exact: true }).check();
  }
  await expect(unassignedNotice).toHaveCount(0);
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
  const columnHeader = page.getByRole("columnheader", {
    name: new RegExp(columnName),
  });
  await expect(columnHeader).toBeVisible();
  const monthRow = page.getByRole("row").filter({ hasText: monthLabel });
  const columnIndex = await columnHeader.evaluate((element) =>
    Array.from(element.parentElement?.children ?? []).indexOf(element),
  );
  const budgetCell = monthRow.getByRole("cell").nth(columnIndex);
  await expect(budgetCell).toHaveClass(/budget-over/);
  await expect(budgetCell).toContainText("69");
  const year = monthLabel.match(/\d{4}/)?.[0] ?? "";
  const yearRow = page.locator(".monthly-year-row").filter({ hasText: year });
  const yearCells = yearRow.getByRole("cell");
  await expect(yearCells.first()).toHaveCSS(
    "background-color",
    "rgb(246, 248, 250)",
  );
  await expect(yearCells.nth(columnIndex)).toHaveCSS(
    "background-color",
    "rgb(246, 248, 250)",
  );
  await expect(yearCells.nth(columnIndex)).toContainText("69");
  await expect(yearCells.first().locator("strong")).toHaveCSS(
    "background-color",
    "rgb(52, 69, 84)",
  );

  await page.reload();
  await expect(
    page.getByRole("columnheader", { name: new RegExp(columnName) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Monthly settings" }).click();
  const savedDialog = page.getByRole("dialog", { name: "Table columns" });
  const savedEditor = savedDialog.getByRole("article", {
    name: `Column settings: ${columnName}`,
  });
  await expect(savedEditor.getByLabel("Monthly budget")).toHaveValue("30");
  for (const category of expenseCategories) {
    await expect(
      savedEditor.getByLabel(category, { exact: true }),
    ).toBeChecked();
  }

  const unsavedName = `Unsaved costs ${variant}`;
  await savedEditor.getByLabel("Column name").fill(unsavedName);
  await savedDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("columnheader", { name: new RegExp(columnName) }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: new RegExp(unsavedName) }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Monthly settings" }).click();
  const cleanupDialog = page.getByRole("dialog", { name: "Table columns" });
  const persistedEditor = cleanupDialog.getByRole("article", {
    name: `Column settings: ${columnName}`,
  });
  await expect(persistedEditor.getByLabel("Column name")).toHaveValue(
    columnName,
  );
  await persistedEditor
    .getByRole("button", { name: `Remove ${columnName}` })
    .click();
  await cleanupDialog.getByRole("button", { name: "Save columns" }).click();
  await expect(cleanupDialog).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: new RegExp(columnName) }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Monthly", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: new RegExp(columnName) }),
  ).toHaveCount(0);
});
