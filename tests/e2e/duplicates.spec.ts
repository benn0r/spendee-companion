import { expect, test } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("Actual deduplicates repeated imports without a local duplicate ledger", async ({
  page,
}, testInfo) => {
  const { csv, variant } = fantasyData(testInfo, "Duplicates");
  await openDashboard(page);
  await importCsv(
    page,
    csv,
    `duplicates-${variant}.csv`,
    /1 file processed · 3 imported/,
  );
  await importCsv(
    page,
    csv,
    `duplicates-repeat-${variant}.csv`,
    /1 file processed · 0 imported to Actual · 0 already present/,
  );
  await page.getByRole("button", { name: /Duplicates/ }).click();
  await expect(
    page.getByRole("heading", { name: "Duplicate records" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Transaction filters" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No separate duplicate ledger is stored locally"),
  ).toBeVisible();
  await expect(page.getByText("No duplicates have been found.")).toBeVisible();
});
