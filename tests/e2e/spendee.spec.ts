import { expect, test } from "@playwright/test";

test("imports fantasy transactions and completes the primary ledger workflow", async ({ page }, testInfo) => {
  const device = testInfo.project.name === "chromium" ? "Desktop" : "Mobile";
  const variant = testInfo.retry ? `${device} Retry ${testInfo.retry}` : device;
  const wallet = `Moon Purse ${variant}`;
  const category = `Stardust Snacks ${variant}`;
  const fantasyCsv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    `2026-07-01T08:00:00+00:00,${wallet},Expense,${category},-24,CHF,Nebula lunch ${variant},cosmic;team,Nova Quill`,
    `2026-07-02T09:00:00+00:00,${wallet},Income,Quest Rewards ${variant},120,CHF,Dragon bounty ${variant},quest,Orion Vale`,
    `2026-07-03T10:00:00+00:00,Cloud Vault ${variant},Expense,Portal Travel ${variant},-45,CHF,Gate fare ${variant},travel,Lyra Moss`,
  ].join("\n");

  await page.addInitScript(() => localStorage.setItem("spendee-locale", "en"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Transaction history" })).toBeVisible();

  await page.getByRole("button", { name: "Import files" }).click();
  const importDialog = page.getByRole("dialog", { name: "Choose export files" });
  await expect(importDialog).toBeVisible();
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: "fantasy-transactions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(fantasyCsv),
  });

  await expect(page.getByText(/1 file processed · 3 imported/)).toBeVisible();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await expect(page.getByText(`Dragon bounty ${variant}`)).toBeVisible();
  await expect(page.getByText(`Gate fare ${variant}`)).toBeVisible();

  const verifiedUntil = page.getByLabel("Verified until");
  if (await verifiedUntil.inputValue() !== "2026-07-02") {
    await verifiedUntil.fill("2026-07-02");
    await page.locator(".valid-until-control").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Transactions through 2026-07-02 are marked as verified.")).toBeVisible();
  }
  expect(await page.getByText("✓ Verified").count()).toBeGreaterThanOrEqual(2);

  await page.getByRole("link", { name: wallet }).first().click();
  await expect(page.getByRole("heading", { name: wallet })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wallet activity" })).toBeVisible();
  await expect(page.getByText(`Nebula lunch ${variant}`)).toBeVisible();
  await expect(page.getByText("Starting amount", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Wallet settings" }).click();
  await expect(page.getByRole("dialog", { name: "Wallet settings" })).toBeVisible();
  await expect(page.getByLabel("Starting amount in CHF")).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.getByRole("link", { name: "Spendee companion" }).click();
  await page.getByRole("link", { name: category }).first().click();
  await expect(page.getByRole("heading", { name: category })).toBeVisible();
  await expect(page.getByRole("img", { name: "CHF spending pie chart" })).toBeVisible();
  await page.getByRole("button", { name: "Category settings" }).click();
  await expect(page.getByRole("dialog", { name: "Category settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.getByRole("link", { name: "Spendee companion" }).click();
  await page.getByRole("button", { name: "Split transactions" }).click();
  await page.getByLabel(/Select transaction/).first().check();
  await page.getByRole("button", { name: /Split selected \(1\)/ }).click();
  const splitDialog = page.getByRole("dialog", { name: "Review selected transactions" });
  await splitDialog.getByPlaceholder("e.g. Weekend cabin").fill(`Moon voyage ${variant}`);
  await splitDialog.getByRole("button", { name: "＋ Add position" }).click();
  await splitDialog.getByLabel("Position 1 description").fill("Potion rebate");
  await splitDialog.getByLabel("Position 1 amount").fill("5");
  await splitDialog.getByRole("button", { name: "Save split" }).click();

  await expect(page).toHaveURL(/\/splits$/);
  const savedSplit = page.getByRole("article").filter({ hasText: `Moon voyage ${variant}` });
  await expect(savedSplit).toBeVisible();
  await expect(savedSplit.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", /\/api\/splits\/\d+\/pdf/);

  await testInfo.attach("completed-workflow", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
