import { expect, test } from "./fixture";
import { openDashboard } from "./helpers";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("uploads, reviews, and submits a receipt to Actual Budget", async ({
  page,
}) => {
  await openDashboard(page);
  await page.getByRole("link", { name: "Receipts" }).click();
  await expect(page.getByRole("heading", { name: "Receipts" })).toBeVisible();
  await expect(page.getByText("No receipts uploaded yet.")).toBeVisible();

  await page.getByRole("button", { name: "Upload receipt" }).click();
  const upload = page.getByRole("dialog", { name: "Upload receipt" });
  await expect(upload).toBeVisible();
  const accountSelect = upload.getByRole("combobox", { name: "Account" });
  await expect(accountSelect).toHaveCSS("appearance", "none");
  await expect(accountSelect).toHaveCSS(
    "background-color",
    "rgb(247, 250, 252)",
  );
  await expect(accountSelect).toHaveCSS("min-height", "42px");
  const selectDecoration = await upload
    .locator(".receipt-select")
    .evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        borderBottomWidth: style.borderBottomWidth,
        content: style.content,
        pointerEvents: style.pointerEvents,
      };
    });
  expect(selectDecoration).toEqual({
    borderBottomWidth: "2px",
    content: '\"\"',
    pointerEvents: "none",
  });
  await upload.locator('input[type="file"]').setInputFiles({
    name: "cosmic-market.png",
    mimeType: "image/png",
    buffer: png,
  });

  const card = page.locator(".receipt-card", {
    hasText: "cosmic-market.png",
  });
  await expect(card).toBeVisible();
  await expect(card.getByText("Processed", { exact: true })).toBeVisible();
  await expect(card.getByText("Moonberry provisions")).toBeVisible();
  await card.getByRole("button", { name: "Review & submit" }).click();

  const review = page.getByRole("dialog", { name: "Review transaction" });
  await expect(review).toBeVisible();
  await review.getByLabel(/Payee/).fill("Cosmic Market");
  await review.getByRole("button", { name: "Add to Actual Budget" }).click();

  await expect(review).toBeHidden();
  await expect(card.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Transaction added to Actual Budget for review."),
  ).toBeVisible();

  const transactionsLoaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions" &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await page.getByRole("link", { name: "Transactions" }).click();
  const transactionPayload = (await (await transactionsLoaded).json()) as {
    transactions: Array<{ payee: string }>;
  };
  expect(transactionPayload.transactions).toContainEqual(
    expect.objectContaining({ payee: "Cosmic Market" }),
  );
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Moonberry provisions", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".cleared-badge.is-uncleared").first(),
  ).toContainText("Uncleared");
});
