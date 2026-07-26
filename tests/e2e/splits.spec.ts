import { expect, test } from "@playwright/test";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("splits can be created, listed, downloaded as PDF, and deleted", async ({ page }, testInfo) => {
  const { csv, variant } = fantasyData(testInfo, "Splits");
  await openDashboard(page);
  await importCsv(page, csv, `splits-${variant}.csv`, /1 file processed · 3 imported/);
  await page.getByRole("button", { name: "Split transactions" }).click();
  await page.getByLabel(/Select transaction/).first().check();
  await page.getByRole("button", { name: /Split selected \(1\)/ }).click();
  const dialog = page.getByRole("dialog", { name: "Review selected transactions" });
  await dialog.getByPlaceholder("e.g. Weekend cabin").fill(`Moon voyage ${variant}`);
  await dialog.getByRole("button", { name: "＋ Add position" }).click();
  await dialog.getByLabel("Position 1 description").fill("Potion rebate");
  await dialog.getByLabel("Position 1 amount").fill("5");
  await dialog.getByRole("button", { name: "Save split" }).click();
  await expect(page).toHaveURL(/\/splits$/);
  const savedSplit = page.getByRole("article").filter({ hasText: `Moon voyage ${variant}` });
  await expect(savedSplit).toBeVisible();
  const pdfHref = await savedSplit.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  expect(pdfHref).toMatch(/\/api\/splits\/\d+\/pdf/);
  const response = await page.request.get(pdfHref as string);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");
  page.once("dialog", (dialog) => dialog.accept());
  await savedSplit.getByRole("button", { name: "Delete" }).click();
  await expect(savedSplit).toHaveCount(0);
});
