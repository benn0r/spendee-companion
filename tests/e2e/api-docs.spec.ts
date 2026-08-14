import { expect, test } from "./fixture";

test("Swagger UI renders below the application header", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/api-docs");

  const header = page.locator("header.topbar");
  const swagger = page.locator(".api-docs-shell .swagger-ui");
  await expect(header).toBeVisible();
  await expect(page.getByRole("link", { name: "API docs" })).toHaveClass(
    /active/,
  );
  await expect(
    page.getByRole("heading", { name: /Spendee companion API/ }),
  ).toBeVisible();
  await expect(
    page.getByText("List accounts, categories, and tags"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Authorize/ }).click();
  await expect(
    page.getByRole("heading", { name: "bearerAuth (http, Bearer)" }),
  ).toBeVisible();
  await expect(
    page.getByText("Use the configured Spendee API key."),
  ).toBeVisible();

  const headerBox = await header.boundingBox();
  const swaggerBox = await swagger.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(swaggerBox).not.toBeNull();
  expect(swaggerBox!.y).toBeGreaterThanOrEqual(
    headerBox!.y + headerBox!.height,
  );
  expect(browserErrors).toEqual([]);
});
