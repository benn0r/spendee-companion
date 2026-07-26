import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";

test("public assets use the same version as the footer build", async ({ page }) => {
  await openDashboard(page);

  const footer = await page.locator(".site-footer > span").textContent();
  const buildId = footer?.match(/build ([a-zA-Z0-9._-]+)/)?.[1];
  expect(buildId).toBeTruthy();

  const assetLinks = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
  await expect(assetLinks).toHaveCount(4);
  for (const link of await assetLinks.all()) {
    await expect(link).toHaveAttribute("href", new RegExp(`[?&]v=${buildId}$`));
  }

  const headerLogo = page.locator("header .brandmark");
  await expect(headerLogo).toHaveAttribute("src", new RegExp(`/icon\\.png\\?v=${buildId}$`));
  await expect(headerLogo).toHaveCSS("border-radius", "11px");
});
