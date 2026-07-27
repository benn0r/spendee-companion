import { expect, test } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("verified-until can be saved, persists, and can be cleared", async ({ page }, testInfo) => {
  const { csv, dates, variant, wallet } = fantasyData(testInfo, "Verified until");
  const secondWallet = `Cloud Vault ${variant}`;

  await openDashboard(page);
  await importCsv(page, csv, `verified-${variant}.csv`, /1 file processed · 3 imported/);
  await page.reload();

  const filters = page.getByRole("region", { name: "Transaction filters" });
  const walletFilter = filters.locator("details.filter-multi").filter({ hasText: "Wallets" });
  await walletFilter.locator("summary").click();
  await walletFilter.getByLabel(wallet, { exact: true }).check();
  await walletFilter.getByLabel(secondWallet, { exact: true }).check();
  await walletFilter.locator("summary").click();
  await filters.getByRole("button", { name: "Apply filters" }).click();

  const verifiedUntil = page.locator('.valid-until-control input[aria-label="Verified until"]');
  await expect(verifiedUntil).toHaveValue("");
  await verifiedUntil.fill(dates[1]);
  await page.locator(".valid-until-control").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".notice.success")).toContainText(`Transactions through ${dates[1]} are marked as verified.`);

  const oldestRow = page.getByRole("row").filter({ hasText: `Nebula lunch ${variant}` });
  const middleRow = page.getByRole("row").filter({ hasText: `Dragon bounty ${variant}` });
  const newestRow = page.getByRole("row").filter({ hasText: `Gate fare ${variant}` });
  await expect(oldestRow.locator(".verified-badge")).toHaveText("✓ Verified");
  await expect(middleRow.locator(".verified-badge")).toHaveText("✓ Verified");
  await expect(newestRow.locator(".verified-badge")).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.valid-until-control input[aria-label="Verified until"]')).toHaveValue(dates[1]);

  await page.locator('.valid-until-control input[aria-label="Verified until"]').fill("");
  await page.locator(".valid-until-control").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".notice.success")).toContainText("Transaction verification date cleared.");
  await expect(page.getByRole("row").filter({ hasText: variant }).locator(".verified-badge")).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.valid-until-control input[aria-label="Verified until"]')).toHaveValue("");
  await expect(page.getByRole("row").filter({ hasText: variant }).locator(".verified-badge")).toHaveCount(0);
});
