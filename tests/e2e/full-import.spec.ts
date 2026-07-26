import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("full import replaces the matching wallet with the uploaded snapshot", async ({ page }, testInfo) => {
  const { dates, variant } = fantasyData(testInfo, "Full import");
  const wallet = `Phoenix Pouch ${variant}`;
  const otherWallet = `Dragon Vault ${variant}`;
  const category = `Moonberry Supplies ${variant}`;
  const header = "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author";
  const initialCsv = [
    header,
    `${dates[0]}T08:00:00+00:00,${wallet},Expense,${category},-20,CHF,Moonberry basket ${variant},pantry,Nova Quill`,
    `${dates[1]}T09:00:00+00:00,${wallet},Expense,${category},-30,CHF,Dragon feed ${variant},quest,Orion Vale`,
    `${dates[2]}T10:00:00+00:00,${otherWallet},Income,Quest Rewards,90,CHF,Guild reward ${variant},quest,Lyra Moss`,
  ].join("\n");
  const replacementCsv = [
    header,
    `${dates[0]}T08:00:00+00:00,${wallet},Expense,${category},-25,CHF,Fresh moonberry basket ${variant},pantry,Nova Quill`,
  ].join("\n");

  await openDashboard(page);
  await importCsv(page, initialCsv, `full-initial-${variant}.csv`, /1 file processed · 3 imported/);
  await expect(page.getByText(`Dragon feed ${variant}`)).toBeVisible();
  await expect(page.getByText(`Guild reward ${variant}`)).toBeVisible();

  await importCsv(
    page,
    replacementCsv,
    `full-replacement-${variant}.csv`,
    /1 file processed · 1 imported · 0 duplicates separated · 2 previous transactions replaced/,
    { fullImport: true },
  );

  await expect(page.getByText(`Fresh moonberry basket ${variant}`)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `Fresh moonberry basket ${variant}` })).toContainText("25.00");
  await expect(page.getByText(`Moonberry basket ${variant}`, { exact: true })).toHaveCount(0);
  await expect(page.getByText(`Dragon feed ${variant}`)).toHaveCount(0);
  await expect(page.getByText(`Guild reward ${variant}`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Fresh moonberry basket ${variant}`)).toBeVisible();
  await expect(page.getByText(`Dragon feed ${variant}`)).toHaveCount(0);
  await expect(page.getByText(`Guild reward ${variant}`)).toBeVisible();
});
