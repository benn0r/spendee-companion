import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("full-import changes stay pending until explicitly reviewed", async ({ page }, testInfo) => {
  const { dates, variant } = fantasyData(testInfo, "Reconciliation");
  const wallet = `Phoenix Pouch ${variant}`;
  const category = `Moonberry Supplies ${variant}`;
  const header = "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author";
  const initialCsv = [
    header,
    `${dates[0]}T08:00:00+00:00,${wallet},Expense,${category},-20,CHF,Moonberry basket ${variant},pantry,Nova Quill`,
    `${dates[1]}T09:00:00+00:00,${wallet},Expense,${category},-30,CHF,Dragon feed ${variant},quest,Orion Vale`,
  ].join("\n");
  const changedCsv = [
    header,
    `${dates[0]}T08:00:00+00:00,${wallet},Expense,${category},-25,CHF,Moonberry basket ${variant},pantry,Nova Quill`,
  ].join("\n");

  const resetVerification = await page.request.put("/api/valid-until", {
    data: { validUntil: null },
  });
  expect(resetVerification.ok()).toBeTruthy();
  await openDashboard(page);
  await importCsv(page, initialCsv, `reconciliation-initial-${variant}.csv`, /1 file processed · 2 imported/);

  await page.getByLabel("Verified until").fill(dates[1]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".notice")).toContainText(`Transactions through ${dates[1]} are marked as verified.`);
  const scenarioVerified = page.getByRole("row").filter({ hasText: wallet }).getByText("✓ Verified");
  await expect(scenarioVerified).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel("Verified until")).toHaveValue(dates[1]);
  await expect(scenarioVerified).toHaveCount(2);

  await importCsv(
    page,
    changedCsv,
    `reconciliation-full-${variant}.csv`,
    /1 file processed · 0 imported · 0 duplicates separated · 2 awaiting approval/,
    { fullImport: true },
  );
  await expect(page.getByRole("heading", { name: "Approval required" })).toBeVisible();

  const changedReview = page.locator("label.review-item")
    .filter({ hasText: wallet })
    .filter({ hasText: "Changed" });
  const missingReview = page.locator("label.review-item")
    .filter({ hasText: wallet })
    .filter({ hasText: "Missing" });
  await expect(changedReview).toHaveCount(1);
  await expect(missingReview).toHaveCount(1);

  const changedRow = page.getByRole("row").filter({ hasText: `Moonberry basket ${variant}` });
  const missingRow = page.getByRole("row").filter({ hasText: `Dragon feed ${variant}` });
  await expect(changedRow).toContainText("20.00");
  await expect(missingRow).toBeVisible();

  await changedReview.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve selected" }).click();
  await expect(page.locator(".notice")).toContainText("1 pending item approved.");
  await expect(changedReview).toHaveCount(0);
  await expect(changedRow).toContainText("25.00");

  await missingReview.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Keep current" }).click();
  await expect(page.locator(".notice")).toContainText("1 pending item rejected.");
  await expect(page.getByRole("heading", { name: "Approval required" })).toHaveCount(0);
  await expect(missingRow).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Approval required" })).toHaveCount(0);
  await expect(changedRow).toContainText("25.00");
  await expect(missingRow).toBeVisible();
});
