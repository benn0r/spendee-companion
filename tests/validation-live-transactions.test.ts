import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../lib/db";
import type {
  ExtractedDocument,
  ValidationAppTransaction,
  ValidationDiff,
} from "../lib/validation-types";
import {
  completeValidation,
  createValidationManualMatch,
  deleteValidationManualMatch,
  enqueueValidation,
  getValidation,
  type ValidationTransactionProvider,
} from "../lib/validations";

const statementTransaction = {
  date: "2026-07-03",
  description: "Comet bakery",
  amount: -18,
  currency: "CHF",
};

const document: ExtractedDocument = {
  title: "Moon statement",
  printDate: "2026-07-04",
  issuer: "Crystal Bank",
  accountReference: "moon-42",
  documentCurrency: "CHF",
  metadata: {},
  transactions: [statementTransaction],
};

const actualTransaction: ValidationAppTransaction = {
  id: "2fb7785f-20c7-44de-a783-3cfc88ee921a",
  accountId: "a4726080-c5e7-4c38-94a9-e9bc8994852c",
  fingerprint: "actual:moon:comet-cafe",
  date: "2026-07-02",
  wallet: "Moon Purse",
  type: "Expense",
  categoryName: "Food",
  amount: -18,
  currency: "CHF",
  note: "Comet cafe",
};

test("live Actual UUID transactions drive validation manual matches without a SQLite ledger", async () => {
  const previousCompatibility = process.env.SQLITE_LEDGER_COMPATIBILITY;
  delete process.env.SQLITE_LEDGER_COMPATIBILITY;
  const db = openDatabase(":memory:");
  try {
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
        )
        .get(),
      undefined,
    );

    const validationId = enqueueValidation(db, {
      wallet: actualTransaction.wallet,
      accountId: actualTransaction.accountId,
      filename: "moon-statement.pdf",
      pdf: Buffer.from("%PDF-fantasy"),
    });
    const initialDiff: ValidationDiff = {
      matching: [],
      missingInApp: [statementTransaction],
      missingInDocument: [actualTransaction],
    };
    completeValidation(db, validationId, {
      document,
      rawOpenAI: {},
      dateFrom: "2026-07-01",
      dateTo: "2026-07-03",
      thumbnail: Buffer.from("fantasy-thumbnail"),
      diff: initialDiff,
      model: "fantasy-model",
    });

    const ranges: Parameters<ValidationTransactionProvider>[0][] = [];
    const provider: ValidationTransactionProvider = async (range) => {
      ranges.push(range);
      return [
        actualTransaction,
        {
          ...actualTransaction,
          id: "outside-range",
          date: "2026-07-04",
          note: "Outside range",
        },
        {
          ...actualTransaction,
          id: "other-wallet",
          accountId: "different-account",
          wallet: "Cloud Vault",
          note: "Other wallet",
        },
        {
          ...actualTransaction,
          id: "actual-transfer",
          type: "Outgoing Transfer",
          note: "Transfer",
        },
        {
          ...actualTransaction,
          id: "actual-starting-balance",
          startingBalance: true,
          note: "Starting Balance",
        },
      ];
    };

    assert.throws(
      () => getValidation(db, validationId),
      /Supply live Actual Budget transactions/,
    );

    const validation = await getValidation(db, validationId, provider);
    assert.deepEqual(ranges, [
      {
        accountId: actualTransaction.accountId,
        wallet: "Moon Purse",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-03",
      },
    ]);
    assert.equal(validation?.suggestions.length, 1);
    assert.equal(validation?.suggestions[0].app.id, actualTransaction.id);

    const matched = await createValidationManualMatch(
      db,
      validationId,
      validation!.suggestions[0].documentKey,
      actualTransaction.fingerprint!,
      provider,
    );
    assert.equal(matched?.diff.matching[0].manual, true);
    assert.equal(matched?.diff.matching[0].app.id, actualTransaction.id);
    assert.equal(typeof matched?.diff.matching[0].app.id, "string");
    assert.equal(matched?.diff.missingInApp.length, 0);
    assert.equal(matched?.diff.missingInDocument.length, 0);

    const unmatched = await deleteValidationManualMatch(
      db,
      validationId,
      validation!.suggestions[0].documentKey,
      [actualTransaction],
    );
    assert.equal(unmatched?.diff.matching.length, 0);
    assert.equal(unmatched?.diff.missingInApp.length, 1);
    assert.equal(unmatched?.diff.missingInDocument[0].id, actualTransaction.id);
    assert.equal(unmatched?.suggestions[0].app.id, actualTransaction.id);
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
        )
        .get(),
      undefined,
    );
  } finally {
    db.close();
    if (previousCompatibility === undefined) {
      delete process.env.SQLITE_LEDGER_COMPATIBILITY;
    } else {
      process.env.SQLITE_LEDGER_COMPATIBILITY = previousCompatibility;
    }
  }
});
