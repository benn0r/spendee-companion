import { expect, type Page, type TestInfo } from "@playwright/test";

export function fantasyData(testInfo: TestInfo, scenario: string) {
  const device = testInfo.project.name === "chromium" ? "Desktop" : "Mobile";
  const retry = testInfo.retry ? ` Retry ${testInfo.retry}` : "";
  const variant = `${scenario} ${device}${retry}`;
  const wallet = `Moon Purse ${variant}`;
  const category = `Stardust Snacks ${variant}`;
  const csv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    `2026-07-01T08:00:00+00:00,${wallet},Expense,${category},-24,CHF,Nebula lunch ${variant},cosmic;team,Nova Quill`,
    `2026-07-02T09:00:00+00:00,${wallet},Income,Quest Rewards ${variant},120,CHF,Dragon bounty ${variant},quest,Orion Vale`,
    `2026-07-03T10:00:00+00:00,Cloud Vault ${variant},Expense,Portal Travel ${variant},-45,CHF,Gate fare ${variant},travel,Lyra Moss`,
  ].join("\n");
  return { category, csv, variant, wallet };
}

export async function openDashboard(page: Page) {
  await page.addInitScript(() => localStorage.setItem("spendee-locale", "en"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Transaction history" })).toBeVisible();
}

export async function importCsv(page: Page, csv: string, filename: string, expected: RegExp) {
  await page.getByRole("button", { name: "Import files" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose export files" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText(expected)).toBeVisible();
}
