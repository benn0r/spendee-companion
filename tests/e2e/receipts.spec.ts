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

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByText("Cosmic Market", { exact: true })).toBeVisible();
  await expect(
    page.locator(".cleared-badge.is-uncleared").first(),
  ).toContainText("Uncleared");
});
