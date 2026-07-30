import { expect, test, type Locator } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

async function useTenRowsAndOpenSecondPage(pagination: Locator) {
  await expect(pagination).toContainText("1–23 of 23");
  await pagination.getByLabel("Rows per page").selectOption("10");
  await expect(pagination).toContainText("Page 1 of 3");
  await pagination.getByRole("button").last().click();
  await expect(pagination).toContainText("Page 2 of 3");
}

test("page size and next-page controls work in transaction, wallet, and category views", async ({
  page,
}, testInfo) => {
  const { dates, variant } = fantasyData(testInfo, "Pagination");
  const wallet = `Orbit Wallet ${variant}`;
  const category = `Meteor Supplies ${variant}`;
  const header =
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author";
  const monthPrefix = dates[0].slice(0, 8);

  // Twenty-three records exercise a partial third page for every paginated
  // transaction view without creating an unnecessarily large fixture.
  const rows = Array.from({ length: 23 }, (_, index) => {
    const number = index + 1;
    const day = String(number).padStart(2, "0");
    return `${monthPrefix}${day}T08:00:00+00:00,${wallet},Expense,${category},-${number},CHF,Orbit purchase ${number} ${variant},orbit,Nova Quill`;
  });
  const csv = [header, ...rows].join("\n");

  await openDashboard(page);
  await importCsv(
    page,
    csv,
    `pagination-${variant}.csv`,
    /1 file processed · 23 imported/,
  );
  // Filter options are loaded independently when the page mounts; reloading
  // makes the wallet created by the import available in that control.
  await page.reload();

  const filters = page.getByRole("region", { name: "Transaction filters" });
  const walletFilter = filters
    .locator("details.filter-multi")
    .filter({ hasText: "Wallets" });
  await walletFilter.locator("summary").click();
  await walletFilter.getByLabel(wallet, { exact: true }).check();
  await walletFilter.locator("summary").click();
  await filters.getByRole("button", { name: "Apply filters" }).click();

  await useTenRowsAndOpenSecondPage(page.locator(".pagination"));
  const dashboardRow = page
    .getByRole("row")
    .filter({ hasText: `Orbit purchase 13 ${variant}` });
  await expect(dashboardRow).toBeVisible();
  await dashboardRow.getByRole("link", { name: wallet }).click();

  await expect(page.getByRole("heading", { name: wallet })).toBeVisible();
  await useTenRowsAndOpenSecondPage(page.locator(".pagination"));
  const walletRow = page
    .getByRole("row")
    .filter({ hasText: `Orbit purchase 13 ${variant}` });
  await expect(walletRow).toBeVisible();
  await walletRow.getByRole("link", { name: category }).click();

  await expect(page.getByRole("heading", { name: category })).toBeVisible();
  await useTenRowsAndOpenSecondPage(page.locator(".pagination"));
  await expect(
    page.getByRole("row").filter({ hasText: `Orbit purchase 13 ${variant}` }),
  ).toBeVisible();
});
