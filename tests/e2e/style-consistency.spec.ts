import { expect, test, type Locator, type Page } from "./fixture";
import { openDashboard } from "./helpers";

async function expectSharedDialog(
  page: Page,
  dialog: Locator,
  mobile: boolean,
) {
  const styles = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    return {
      bottom: bounds.bottom,
      borderRadius: computed.borderRadius,
      className: element.className,
      maxHeight: computed.maxHeight,
      overflowY: computed.overflowY,
      padding: computed.padding,
      top: bounds.top,
    };
  });
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  expect(styles.className).toContain("dialog-surface");
  expect(styles.borderRadius).toBe("14px");
  expect(styles.maxHeight).not.toBe("none");
  expect(styles.overflowY).toBe("auto");
  expect(styles.padding).toBe(mobile ? "18px" : "20px");
  expect(styles.top).toBeGreaterThanOrEqual(0);
  expect(styles.bottom).toBeLessThanOrEqual(viewportHeight);
}

test("pages and modals share the same visual foundations", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";

  await openDashboard(page);
  await expect(page.locator(".ledger")).toHaveCSS("border-radius", "13px");
  await expect(page.getByRole("heading", { name: "Transactions" })).toHaveCSS(
    "font-size",
    "31px",
  );

  await page.getByRole("button", { name: "Import files" }).click();
  const importDialog = page.getByRole("dialog", {
    name: "Choose export files",
  });
  await expectSharedDialog(page, importDialog, mobile);
  await importDialog.getByRole("button", { name: "Close import" }).click();

  await page.getByRole("link", { name: "Validate" }).click();
  await expect(page.getByRole("heading", { name: "Validate" })).toHaveCSS(
    "font-size",
    "31px",
  );
  await expect(page.locator(".validation-history")).toHaveCSS(
    "border-radius",
    "13px",
  );
  await expect(page.locator(".validation-results")).toHaveCSS(
    "border-radius",
    "13px",
  );
  await page.getByRole("button", { name: "Upload document" }).click();
  const validationUpload = page.getByRole("dialog", {
    name: "Upload document",
  });
  await expectSharedDialog(page, validationUpload, mobile);
  await validationUpload.getByRole("button", { name: "Close upload" }).click();
  await page.getByRole("button", { name: "Validation settings" }).click();
  const validationSettings = page.getByRole("dialog", {
    name: "Ignored descriptions",
  });
  await expectSharedDialog(page, validationSettings, mobile);
  await validationSettings
    .getByRole("button", { name: "Close", exact: true })
    .click();

  await page.getByRole("link", { name: "Monthy" }).click();
  await expect(page.getByRole("heading", { name: "Monthy" })).toHaveCSS(
    "font-size",
    "31px",
  );
  await page.getByRole("button", { name: "Monthy settings" }).click();
  const monthlySettings = page.getByRole("dialog", { name: "Table columns" });
  await expectSharedDialog(page, monthlySettings, mobile);
  await monthlySettings.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/wallets/Style%20Audit%20Wallet");
  await page.getByRole("button", { name: "Wallet settings" }).click();
  const walletSettings = page.getByRole("dialog", { name: "Wallet settings" });
  await expectSharedDialog(page, walletSettings, mobile);
  await walletSettings.getByRole("button", { name: "Close settings" }).click();

  await page.goto("/categories/style-audit-category");
  await page.getByRole("button", { name: "Category settings" }).click();
  const categorySettings = page.getByRole("dialog", {
    name: "Category settings",
  });
  await expectSharedDialog(page, categorySettings, mobile);
  await categorySettings.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("link", { name: "Splits", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Past splits" })).toHaveCSS(
    "font-size",
    "31px",
  );
});
