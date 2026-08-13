import { expect, type Page, type TestInfo } from "@playwright/test";
import { seedFantasyActualFromCsv } from "../support/fantasy-actual";

export function fantasyData(testInfo: TestInfo, scenario: string) {
  const device = testInfo.project.name === "chromium" ? "Desktop" : "Mobile";
  const retry = testInfo.retry ? ` Retry ${testInfo.retry}` : "";
  const variant = `${scenario} ${device} Run ${testInfo.repeatEachIndex}${retry}`;
  // The mocked statement fixtures use July 2026. Keeping the fantasy ledger in
  // that month makes reconciliation deterministic on every CI run.
  const month = "2026-07";
  const dates = [`${month}-01`, `${month}-02`, `${month}-03`];
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "Europe/Zurich",
    year: "numeric",
  }).format(new Date(`${month}-15T12:00:00.000Z`));
  const wallet = `Moon Purse ${variant}`;
  const category = `Stardust Snacks ${variant}`;
  const rewardCategory = `Quest Rewards ${variant}`;
  const travelCategory = `Portal Travel ${variant}`;
  const csv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    `${dates[0]}T08:00:00+00:00,${wallet},Expense,${category},-24,CHF,Nebula lunch ${variant},"cosmic,team",Nova Quill`,
    `${dates[1]}T09:00:00+00:00,${wallet},Income,${rewardCategory},120,CHF,Dragon bounty ${variant},quest,Orion Vale`,
    `${dates[2]}T10:00:00+00:00,Cloud Vault ${variant},Expense,${travelCategory},-45,CHF,Gate fare ${variant},travel,Lyra Moss`,
  ].join("\n");
  seedFantasyActualFromCsv(csv);
  return {
    category,
    csv,
    dates,
    expenseCategories: [category, travelCategory],
    monthLabel,
    variant,
    wallet,
  };
}

export async function openDashboard(page: Page) {
  await page.addInitScript(() => localStorage.setItem("spendee-locale", "en"));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Transaction history" }),
  ).toBeVisible();
}

export async function importCsv(
  page: Page,
  csv: string,
  filename: string,
  expected: RegExp,
  options: { fullImport?: boolean } = {},
) {
  seedFantasyActualFromCsv(csv);
  await page.getByRole("button", { name: "Import files" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose export files" });
  if (options.fullImport) await dialog.getByRole("checkbox").check();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(
    page.locator(".notice").filter({ hasText: expected }),
  ).toBeVisible();
}
