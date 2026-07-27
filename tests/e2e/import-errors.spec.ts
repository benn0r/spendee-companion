import { expect, test } from "./fixture";
import { fantasyData, openDashboard } from "./helpers";

test("a failed import keeps the dialog open and a valid retry succeeds", async ({ page }, testInfo) => {
  const { csv, variant, wallet } = fantasyData(testInfo, "Import recovery");
  await openDashboard(page);

  await page.getByRole("button", { name: "Import files" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose export files" });
  const fileInput = dialog.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: `unsupported-${variant}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from("This is not a transaction export."),
  });

  await expect(dialog).toBeVisible();
  await expect(page.locator(".notice.error")).toContainText("Only .xlsx and .csv files are supported.");
  await expect(dialog.getByRole("button", { name: "Choose files" })).toBeEnabled();

  await fileInput.setInputFiles({
    name: `recovered-${variant}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".notice.success")).toContainText("1 file processed · 3 imported");
  const walletWidget = page.locator("details.dashboard-widget").filter({ hasText: "Wallets" });
  await walletWidget.locator("summary").click();
  await expect(walletWidget.getByRole("link", { name: wallet })).toBeVisible();
});
