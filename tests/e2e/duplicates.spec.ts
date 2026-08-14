import { expect, test } from "./fixture";
import { fantasyData, openDashboard, seedCsvTransactions } from "./helpers";

test("Actual uses no local duplicate ledger", async ({ page }, testInfo) => {
  const { csv } = fantasyData(testInfo, "Duplicates");
  await openDashboard(page);
  await seedCsvTransactions(page, csv);
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
