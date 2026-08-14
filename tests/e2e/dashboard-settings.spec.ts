import { expect, test } from "./fixture";
import { fantasyData, openDashboard, seedCsvTransactions } from "./helpers";

test("Actual cleared status is shown across transaction views", async ({
  page,
}, testInfo) => {
  const { category, csv, variant, wallet } = fantasyData(
    testInfo,
    "Cleared status",
  );
  const [header, ...rows] = csv.split("\n");
  const clearedCsv = [
    `${header},Cleared`,
    `${rows[0]},true`,
    `${rows[1]},false`,
    `${rows[2]},true`,
  ].join("\n");

  await openDashboard(page);
  await seedCsvTransactions(page, clearedCsv);

  const clearedRow = page
    .getByRole("row")
    .filter({ hasText: `Nebula lunch ${variant}` });
  const unclearedRow = page
    .getByRole("row")
    .filter({ hasText: `Dragon bounty ${variant}` });
  await expect(clearedRow.locator(".cleared-badge")).toContainText("Cleared");
  await expect(
    clearedRow.locator('[data-ionicon="checkmark-circle"]'),
  ).toBeVisible();
  await expect(unclearedRow.locator(".cleared-badge")).toContainText(
    "Uncleared",
  );
  await expect(
    unclearedRow.locator('[data-ionicon="ellipse-outline"]'),
  ).toBeVisible();
  await expect(page.getByText("Verified until")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import files" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Duplicates/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Duplicates/ })).toHaveCount(0);
  expect((await page.request.get("/api/valid-until")).status()).toBe(404);
  expect((await page.request.post("/api/import")).status()).toBe(404);
  expect((await page.request.get("/api/duplicates")).status()).toBe(404);
  expect((await page.request.get("/api/stats")).status()).toBe(404);

  await clearedRow.getByRole("link", { name: wallet }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `Nebula lunch ${variant}` })
      .locator(".cleared-badge"),
  ).toContainText("Cleared");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `Nebula lunch ${variant}` })
      .locator('[data-ionicon="checkmark-circle"]'),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `Dragon bounty ${variant}` })
      .locator(".cleared-badge"),
  ).toContainText("Uncleared");

  await page.getByRole("link", { name: "Spendee companion" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: `Nebula lunch ${variant}` })
    .getByRole("link", { name: category })
    .click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `Nebula lunch ${variant}` })
      .locator(".cleared-badge"),
  ).toContainText("Cleared");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: `Nebula lunch ${variant}` })
      .locator('[data-ionicon="checkmark-circle"]'),
  ).toBeVisible();
});
