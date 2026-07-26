import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("Monthly columns can merge categories and persist a budget", async ({ page }, testInfo) => {
  const { category, csv, variant } = fantasyData(testInfo, "Monthly");
  await openDashboard(page);
  await importCsv(page, csv, `monthly-${variant}.csv`, /1 file processed · 3 imported/);
  await page.getByRole("link", { name: "Monthy" }).click();
  await expect(page.getByRole("heading", { name: "Monthy" })).toBeVisible();
  await page.getByRole("button", { name: "Monthy settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Table columns" });
  await dialog.getByRole("button", { name: "＋ Add column" }).click();
  const editor = dialog.locator(".report-column-editor").last();
  await editor.getByLabel("Column name").fill(`Cosmic costs ${variant}`);
  await editor.getByLabel("Monthly budget").fill("30");
  await editor.getByLabel(category, { exact: true }).check();
  await dialog.getByRole("button", { name: "Save columns" }).click();
  await expect(page.getByText("Monthly report columns saved.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: new RegExp(`Cosmic costs ${variant}`) })).toBeVisible();
  await expect(page.getByText("July 2026", { exact: true })).toBeVisible();
});
