import assert from "node:assert/strict";
import test from "node:test";
import {
  compareValidationTransactions,
  validationDateRange,
} from "../lib/validation-diff";
import {
  applyStoredValidationMatches,
  bestValidationCandidate,
} from "../lib/validation-manual-matches";

test("validation diff matches transactions one-to-one and keeps both missing sides", () => {
  const document = [
    {
      date: "2026-07-02",
      description: "Dragon feed",
      amount: -30,
      currency: "chf",
    },
    {
      date: "2026-07-01",
      description: "Nebula lunch",
      amount: -24,
      currency: "CHF",
    },
    {
      date: "2026-07-01",
      description: "Duplicate statement line",
      amount: -24,
      currency: "CHF",
    },
  ];
  const app = [
    {
      id: 1,
      date: "2026-07-01T08:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Food",
      amount: -24,
      currency: "CHF",
      note: "different label",
    },
    {
      id: 2,
      date: "2026-07-03T08:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Travel",
      amount: -9,
      currency: "CHF",
      note: "Portal toll",
    },
  ];
  const result = compareValidationTransactions(document, app);
  assert.equal(result.matching.length, 1);
  assert.equal(result.matching[0].app.id, 1);
  assert.deepEqual(
    result.missingInApp.map((item) => item.description),
    ["Dragon feed", "Duplicate statement line"],
  );
  assert.deepEqual(
    result.missingInDocument.map((item) => item.id),
    [2],
  );
  assert.deepEqual(validationDateRange(document), {
    dateFrom: "2026-07-01",
    dateTo: "2026-07-02",
  });
  assert.throws(
    () => validationDateRange([]),
    /does not contain any transactions/,
  );
});

test("manual validation matching ranks plausible candidates and consumes both sides", () => {
  const document = {
    date: "2026-07-03",
    description: "Comet bakery",
    amount: -18,
    currency: "CHF",
  };
  const candidates = [
    {
      id: 1,
      fingerprint: "distant",
      date: "2026-06-20T08:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Food",
      amount: -40,
      currency: "CHF",
      note: "Unrelated market",
    },
    {
      id: 2,
      fingerprint: "best",
      date: "2026-07-03T08:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Food",
      amount: -18,
      currency: "CHF",
      note: "Comet cafe",
    },
    {
      id: 3,
      fingerprint: "wrong-direction",
      date: "2026-07-03T08:00:00.000Z",
      wallet: "Moon Purse",
      type: "Income",
      categoryName: "Income",
      amount: 18,
      currency: "CHF",
      note: "Comet refund",
    },
  ];
  assert.equal(bestValidationCandidate(document, candidates)?.id, 2);
  assert.equal(
    bestValidationCandidate(document, [
      { ...candidates[1], amount: -18.01 },
      { ...candidates[1], id: 4, amount: -17.99 },
    ]),
    undefined,
  );

  const initial = applyStoredValidationMatches(
    { matching: [], missingInApp: [document], missingInDocument: candidates },
    [],
  );
  assert.equal(initial.suggestions[0].app.id, 2);
  const matched = applyStoredValidationMatches(
    { matching: [], missingInApp: [document], missingInDocument: candidates },
    [
      {
        documentKey: initial.suggestions[0].documentKey,
        appFingerprint: "best",
      },
    ],
  );
  assert.equal(matched.diff.matching[0].manual, true);
  assert.equal(matched.diff.matching[0].app.id, 2);
  assert.equal(matched.diff.missingInApp.length, 0);
  assert.deepEqual(
    matched.diff.missingInDocument.map((item) => item.id),
    [1, 3],
  );
});
