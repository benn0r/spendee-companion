import assert from "node:assert/strict";
import test from "node:test";
import { compareValidationTransactions, validationDateRange } from "../lib/validation-diff";

test("validation diff matches transactions one-to-one and keeps both missing sides", () => {
  const document = [
    { date: "2026-07-02", description: "Dragon feed", amount: -30, currency: "chf" },
    { date: "2026-07-01", description: "Nebula lunch", amount: -24, currency: "CHF" },
    { date: "2026-07-01", description: "Duplicate statement line", amount: -24, currency: "CHF" },
  ];
  const app = [
    { id: 1, date: "2026-07-01T08:00:00.000Z", wallet: "Moon Purse", type: "Expense", categoryName: "Food", amount: -24, currency: "CHF", note: "different label" },
    { id: 2, date: "2026-07-03T08:00:00.000Z", wallet: "Moon Purse", type: "Expense", categoryName: "Travel", amount: -9, currency: "CHF", note: "Portal toll" },
  ];
  const result = compareValidationTransactions(document, app);
  assert.equal(result.matching.length, 1);
  assert.equal(result.matching[0].app.id, 1);
  assert.deepEqual(result.missingInApp.map((item) => item.description), ["Dragon feed", "Duplicate statement line"]);
  assert.deepEqual(result.missingInDocument.map((item) => item.id), [2]);
  assert.deepEqual(validationDateRange(document), { dateFrom: "2026-07-01", dateTo: "2026-07-02" });
  assert.throws(() => validationDateRange([]), /does not contain any transactions/);
});
