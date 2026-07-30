import { expect, test } from "./fixture";
import { openDashboard } from "./helpers";

test("public assets use the same version as the footer build", async ({
  page,
}) => {
  await openDashboard(page);

  const footer = await page.locator(".site-footer > span").textContent();
  const buildId = footer?.match(/build ([a-zA-Z0-9._-]+)/)?.[1];
  expect(buildId).toBeTruthy();

  const assetLinks = page.locator(
    'link[rel="icon"], link[rel="apple-touch-icon"]',
  );
  await expect(assetLinks).toHaveCount(4);
  for (const link of await assetLinks.all()) {
    await expect(link).toHaveAttribute("href", new RegExp(`[?&]v=${buildId}$`));
  }

  const iconUrls = await assetLinks.evaluateAll((links) =>
    links.map((link) => (link as HTMLLinkElement).href),
  );
  const cornerAlphas = await page.evaluate(
    async (urls) =>
      Promise.all(
        urls.map(async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is unavailable.");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, 1, 1).data[3];
        }),
      ),
    iconUrls,
  );
  expect(cornerAlphas).toEqual([0, 0, 0, 0]);

  const headerLogo = page.locator("header .brandmark");
  await expect(headerLogo).toHaveAttribute(
    "src",
    new RegExp(`/icon\\.png\\?v=${buildId}$`),
  );
  await expect(headerLogo).toHaveCSS("border-radius", "11px");
});
