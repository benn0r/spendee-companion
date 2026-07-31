import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getFilteredTransactionPage,
  importTransactions,
  openDatabase,
  type Db,
} from "../lib/db";
import {
  addValidationBlacklist,
  deleteValidationBlacklist,
  filterBlacklistedTransactions,
  listValidationBlacklist,
  normalizeBlacklistedDescription,
} from "../lib/validation-blacklist";
import type {
  ExtractedDocument,
  ValidationDiff,
} from "../lib/validation-types";
import {
  completeValidation,
  createValidationManualMatch,
  createValidation,
  deleteValidation,
  deleteValidationManualMatch,
  enqueueValidation,
  failValidation,
  getValidation,
  getValidationThumbnail,
  getWalletValidationTransactions,
  listValidations,
  updateValidationDiff,
} from "../lib/validations";

function withDatabase(run: (db: Db) => void) {
  const db = openDatabase(":memory:");
  try {
    run(db);
  } finally {
    db.close();
  }
}

const document: ExtractedDocument = {
  title: "Crystal Bank statement",
  printDate: "2026-07-14",
  issuer: "Crystal Bank",
  accountReference: "moon-42",
  documentCurrency: "CHF",
  metadata: { period: "July 2026" },
  transactions: [
    {
      date: "2026-07-01",
      description: "Potion supplies",
      amount: -18.5,
      currency: "CHF",
    },
  ],
};

const emptyDiff: ValidationDiff = {
  matching: [],
  missingInApp: [],
  missingInDocument: [],
};

test("queued validations transition to complete and persist every result artifact", () => {
  withDatabase((db) => {
    const id = enqueueValidation(db, {
      wallet: "Moon Purse",
      filename: "crystal-statement.pdf",
      pdf: Buffer.from("%PDF-fantasy"),
    });

    const queued = getValidation(db, id);
    assert.equal(queued?.status, "processing");
    assert.equal(queued?.title, "crystal-statement.pdf");
    assert.deepEqual(queued?.diff, emptyDiff);
    assert.deepEqual(listValidations(db)[0].counts, {
      matching: 0,
      missingInApp: 0,
      missingInDocument: 0,
    });
    assert.equal(
      (
        db
          .prepare(
            "SELECT length(pdf_blob) AS size FROM validation_runs WHERE id = ?",
          )
          .get(id) as { size: number }
      ).size,
      Buffer.byteLength("%PDF-fantasy"),
    );

    const diff: ValidationDiff = {
      matching: [
        {
          document: document.transactions[0],
          app: {
            id: 17,
            date: "2026-07-01T09:00:00.000Z",
            wallet: "Moon Purse",
            type: "Expense",
            categoryName: "Alchemy",
            amount: -18.5,
            currency: "CHF",
            note: "Potion supplies",
          },
        },
      ],
      missingInApp: [
        {
          date: "2026-07-02",
          description: "Dragon feed",
          amount: -8,
          currency: "CHF",
        },
      ],
      missingInDocument: [],
    };
    completeValidation(db, id, {
      document,
      rawOpenAI: { responseId: "fantasy-response" },
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
      thumbnail: Buffer.from("fantasy-thumbnail"),
      diff,
      model: "fantasy-model",
    });

    const completed = getValidation(db, id);
    assert.equal(completed?.status, "complete");
    assert.equal(completed?.error, null);
    assert.equal(completed?.model, "fantasy-model");
    assert.deepEqual(completed?.metadata, document.metadata);
    assert.deepEqual(completed?.extracted, document);
    assert.deepEqual(completed?.rawOpenAI, { responseId: "fantasy-response" });
    assert.deepEqual(completed?.diff, diff);
    assert.deepEqual(
      getValidationThumbnail(db, id),
      Buffer.from("fantasy-thumbnail"),
    );
    assert.equal(
      (
        db
          .prepare("SELECT pdf_blob FROM validation_runs WHERE id = ?")
          .get(id) as { pdf_blob: Buffer | null }
      ).pdf_blob,
      null,
    );
    assert.deepEqual(listValidations(db)[0].counts, {
      matching: 1,
      missingInApp: 1,
      missingInDocument: 0,
    });

    const updatedDiff: ValidationDiff = {
      ...emptyDiff,
      missingInDocument: diff.matching.map((match) => match.app),
    };
    updateValidationDiff(db, id, updatedDiff);
    assert.deepEqual(getValidation(db, id)?.diff, updatedDiff);
  });
});

test("failed and directly created validations expose stable read models", () => {
  withDatabase((db) => {
    const failedId = enqueueValidation(db, {
      wallet: "Moon Purse",
      filename: "broken.pdf",
      pdf: Buffer.from("%PDF-broken"),
    });
    failValidation(db, failedId, "The document is enchanted.");

    const failed = getValidation(db, failedId);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.error, "The document is enchanted.");
    assert.equal(
      (
        db
          .prepare("SELECT pdf_blob FROM validation_runs WHERE id = ?")
          .get(failedId) as { pdf_blob: Buffer | null }
      ).pdf_blob,
      null,
    );

    const created = createValidation(db, {
      wallet: "Crystal Vault",
      filename: "complete.pdf",
      document,
      rawOpenAI: { completed: true },
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      thumbnail: Buffer.from("complete-thumbnail"),
      diff: emptyDiff,
      model: "fantasy-model",
    });
    assert.equal(created?.status, "complete");
    assert.equal(created?.wallet, "Crystal Vault");
    assert.equal(listValidations(db)[0].id, created?.id);
    assert.equal(getValidation(db, 999_999), null);
    assert.equal(getValidationThumbnail(db, 999_999), null);
  });
});

test("validation transaction lookup is date-inclusive and ignores every transfer type", () => {
  withDatabase((db) => {
    const base = {
      date: "2026-07-01T00:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Alchemy",
      amount: -10,
      currency: "CHF",
      note: "Start boundary",
      labels: null,
      author: "Nova",
    };
    const transactions = [
      base,
      {
        ...base,
        date: "2026-07-02T23:59:59.000Z",
        amount: -11,
        note: "End boundary",
      },
      {
        ...base,
        date: "2026-07-03T00:00:00.000Z",
        amount: -12,
        note: "After range",
      },
      {
        ...base,
        date: "2026-07-01T08:00:00.000Z",
        type: "Transfer",
        amount: -13,
        note: "Transfer",
      },
      {
        ...base,
        date: "2026-07-01T09:00:00.000Z",
        type: "Incoming Transfer",
        amount: 14,
        note: "Incoming",
      },
      {
        ...base,
        date: "2026-07-01T10:00:00.000Z",
        type: "Outgoing Transfer",
        amount: -15,
        note: "Outgoing",
      },
      {
        ...base,
        date: "2026-07-01T11:00:00.000Z",
        wallet: "Crystal Vault",
        amount: -16,
        note: "Other wallet",
      },
      {
        ...base,
        date: "2026-07-01T12:00:00.000Z",
        type: "Card Transfer Fee",
        amount: -17,
        note: "Ordinary expense",
      },
    ];
    importTransactions(
      db,
      "validation-range.csv",
      transactions.map((transaction, index) => ({
        transaction,
        sourceRow: index + 2,
        raw: transaction,
      })),
    );
    const hidden = db
      .prepare("SELECT id FROM transactions WHERE note = 'End boundary'")
      .get() as { id: number };
    db.prepare(
      "UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(hidden.id);

    const rows = getWalletValidationTransactions(
      db,
      "Moon Purse",
      "2026-07-01",
      "2026-07-02",
    );
    assert.deepEqual(
      rows.map((row) => row.note),
      ["Start boundary", "Ordinary expense"],
    );
  });
});

test("transaction pages reconcile the newest completed validation after a full re-import", () => {
  withDatabase((db) => {
    const transaction = {
      date: "2026-07-01T09:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Alchemy",
      amount: -18.5,
      currency: "CHF",
      note: "Potion supplies",
      labels: null,
      author: "Nova",
    };
    const otherWalletTransaction = {
      ...transaction,
      date: "2026-07-02T09:00:00.000Z",
      wallet: "Crystal Vault",
      note: "Unrelated vault transaction",
    };
    importTransactions(db, "original.csv", [
      { transaction, sourceRow: 2, raw: transaction },
      {
        transaction: otherWalletTransaction,
        sourceRow: 3,
        raw: otherWalletTransaction,
      },
    ]);
    const app = getWalletValidationTransactions(
      db,
      transaction.wallet,
      "2026-07-01",
      "2026-07-01",
    )[0];
    const matchingDiff = (description: string): ValidationDiff => ({
      matching: [
        {
          document: {
            date: "2026-07-01",
            description,
            amount: -18.5,
            currency: "CHF",
          },
          app,
        },
      ],
      missingInApp: [],
      missingInDocument: [],
    });
    const createMatch = (title: string, description: string) => {
      createValidation(db, {
        wallet: transaction.wallet,
        filename: `${title}.pdf`,
        document: {
          ...document,
          title,
          transactions: [{ ...document.transactions[0], description }],
        },
        rawOpenAI: {},
        dateFrom: "2026-07-01",
        dateTo: "2026-07-01",
        thumbnail: Buffer.from(title),
        diff: matchingDiff(description),
        model: "fantasy-model",
      });
      return (
        db.prepare("SELECT MAX(id) AS id FROM validation_runs").get() as {
          id: number;
        }
      ).id;
    };
    const filters = {
      wallets: [transaction.wallet],
      types: [],
      categories: [],
      tags: [],
      authors: [],
    };

    const olderId = createMatch("Older statement", "Old document wording");
    const latestId = createMatch("Latest statement", "Latest document wording");
    db.prepare(
      "UPDATE validation_runs SET created_at = '2026-07-01 12:00:00' WHERE id IN (?, ?)",
    ).run(olderId, latestId);

    assert.deepEqual(
      getFilteredTransactionPage(db, "transactions", filters, 1, 25).rows[0]
        .validation,
      {
        id: latestId,
        title: "Latest statement",
        description: "Latest document wording",
      },
    );

    const ignoredId = createMatch(
      "Failed statement",
      "Failed document wording",
    );
    db.prepare(
      "UPDATE validation_runs SET status = 'failed', created_at = '2099-01-01 00:00:00' WHERE id = ?",
    ).run(ignoredId);
    assert.equal(
      getFilteredTransactionPage(db, "transactions", filters, 1, 25).rows[0]
        .validation?.id,
      latestId,
    );

    importTransactions(db, "duplicate.csv", [
      { transaction, sourceRow: 2, raw: transaction },
    ]);
    assert.equal(
      getFilteredTransactionPage(db, "duplicates", filters, 1, 25).rows[0]
        .validation,
      null,
    );

    importTransactions(
      db,
      "fresh-snapshot.csv",
      [{ transaction, sourceRow: 2, raw: transaction }],
      {
        fullImport: true,
      },
    );
    const reimportedId = (
      db
        .prepare("SELECT id FROM transactions WHERE wallet = ?")
        .get(transaction.wallet) as { id: number }
    ).id;
    assert.notEqual(
      reimportedId,
      app.id,
      "the regression requires a fresh database ID",
    );
    assert.deepEqual(
      getFilteredTransactionPage(db, "transactions", filters, 1, 25).rows[0]
        .validation,
      {
        id: latestId,
        title: "Latest statement",
        description: "Latest document wording",
      },
    );

    const replacement = {
      ...transaction,
      amount: -19,
      note: "Entirely different replacement",
    };
    importTransactions(
      db,
      "replacement.csv",
      [{ transaction: replacement, sourceRow: 2, raw: replacement }],
      {
        fullImport: true,
      },
    );
    const replacementId = (
      db
        .prepare("SELECT id FROM transactions WHERE wallet = ?")
        .get(transaction.wallet) as { id: number }
    ).id;
    assert.equal(
      replacementId,
      reimportedId,
      "test requires SQLite to reuse the replaced transaction ID",
    );
    assert.equal(
      getFilteredTransactionPage(db, "transactions", filters, 1, 25).rows[0]
        .validation,
      null,
    );
  });
});

test("validation reconciliation consumes matches across the full range before paginating", () => {
  withDatabase((db) => {
    const first = {
      date: "2026-07-01T09:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Alchemy",
      amount: -18.5,
      currency: "CHF",
      note: "First deterministic match",
      labels: null,
      author: "Nova",
    };
    const second = { ...first, note: "Second matching candidate" };
    importTransactions(db, "same-posting-key.csv", [
      { transaction: first, sourceRow: 2, raw: first },
      { transaction: second, sourceRow: 3, raw: second },
    ]);
    const firstApp = getWalletValidationTransactions(
      db,
      first.wallet,
      "2026-07-01",
      "2026-07-01",
    )[0];
    const validationId = createValidation(db, {
      wallet: first.wallet,
      filename: "single-line-statement.pdf",
      document,
      rawOpenAI: {},
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      thumbnail: Buffer.from("single-line"),
      diff: {
        matching: [{ document: document.transactions[0], app: firstApp }],
        missingInApp: [],
        missingInDocument: [
          getWalletValidationTransactions(
            db,
            first.wallet,
            "2026-07-01",
            "2026-07-01",
          )[1],
        ],
      },
      model: "fantasy-model",
    })?.id;
    const filters = {
      wallets: [first.wallet],
      types: [],
      categories: [],
      tags: [],
      authors: [],
    };

    const newestPage = getFilteredTransactionPage(
      db,
      "transactions",
      filters,
      1,
      1,
    );
    assert.equal(newestPage.rows[0].note, second.note);
    assert.equal(newestPage.rows[0].validation, null);

    const oldestPage = getFilteredTransactionPage(
      db,
      "transactions",
      filters,
      2,
      1,
    );
    assert.equal(oldestPage.rows[0].note, first.note);
    assert.deepEqual(oldestPage.rows[0].validation, {
      id: validationId,
      title: document.title,
      description: document.transactions[0].description,
    });
  });
});

test("manual validation matches and transaction links survive full wallet replacement", () => {
  withDatabase((db) => {
    const candidate = {
      date: "2026-07-03T09:00:00.000Z",
      wallet: "Moon Purse",
      type: "Expense",
      categoryName: "Food",
      amount: -19,
      currency: "CHF",
      note: "Comet cafe",
      labels: null,
      author: "Nova",
    };
    const importCandidate = (fullImport = false) =>
      importTransactions(
        db,
        fullImport ? "fresh-wallet.csv" : "wallet.csv",
        [{ transaction: candidate, sourceRow: 2, raw: candidate }],
        { fullImport },
      );
    importCandidate();
    const app = getWalletValidationTransactions(
      db,
      candidate.wallet,
      "2026-07-03",
      "2026-07-03",
    )[0];
    const statementTransaction = {
      date: "2026-07-03",
      description: "Comet bakery",
      amount: -18,
      currency: "CHF",
    };
    const validation = createValidation(db, {
      wallet: candidate.wallet,
      filename: "comet-statement.pdf",
      document: { ...document, transactions: [statementTransaction] },
      rawOpenAI: {},
      dateFrom: "2026-07-03",
      dateTo: "2026-07-03",
      thumbnail: Buffer.from("thumbnail"),
      diff: {
        matching: [],
        missingInApp: [statementTransaction],
        missingInDocument: [app],
      },
      model: "fantasy-model",
    });
    assert.ok(validation);
    assert.equal(validation.suggestions[0].app.id, app.id);
    const matched = createValidationManualMatch(
      db,
      validation.id,
      validation.suggestions[0].documentKey,
      String(validation.suggestions[0].app.fingerprint),
    );
    assert.equal(matched?.diff.matching[0].manual, true);
    assert.equal(matched?.diff.missingInApp.length, 0);
    const unmatched = deleteValidationManualMatch(
      db,
      validation.id,
      validation.suggestions[0].documentKey,
    );
    assert.equal(unmatched?.diff.matching.length, 0);
    assert.equal(unmatched?.diff.missingInApp.length, 1);
    assert.equal(unmatched?.suggestions[0].app.note, candidate.note);
    createValidationManualMatch(
      db,
      validation.id,
      unmatched!.suggestions[0].documentKey,
      String(unmatched!.suggestions[0].app.fingerprint),
    );

    const other = { ...candidate, wallet: "Cloud Vault", note: "Anchor row" };
    importTransactions(db, "other-wallet.csv", [
      { transaction: other, sourceRow: 2, raw: other },
    ]);
    importCandidate(true);
    const fresh = getValidation(db, validation.id);
    assert.notEqual(fresh?.diff.matching[0].app.id, app.id);
    assert.equal(fresh?.diff.matching[0].manual, true);
    const filters = {
      wallets: [candidate.wallet],
      types: [],
      categories: [],
      tags: [],
      authors: [],
    };
    assert.deepEqual(
      getFilteredTransactionPage(db, "transactions", filters, 1, 25).rows[0]
        .validation,
      {
        id: validation.id,
        title: document.title,
        description: statementTransaction.description,
      },
    );

    assert.equal(deleteValidation(db, validation.id), true);
    assert.equal(getValidation(db, validation.id), null);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM validation_manual_matches WHERE validation_id = ?",
          )
          .get(validation.id) as { count: number }
      ).count,
      0,
    );
    assert.equal(
      getFilteredTransactionPage(db, "transactions", filters, 1, 25).rows[0]
        .validation,
      null,
    );
  });
});

test("description blacklist normalizes, de-duplicates, filters, and deletes entries", () => {
  withDatabase((db) => {
    assert.equal(
      normalizeBlacklistedDescription("  Dragon   FEED  "),
      "dragon feed",
    );
    assert.throws(
      () => addValidationBlacklist(db, "   "),
      /Description is required/,
    );

    addValidationBlacklist(db, "  Dragon   Feed ");
    addValidationBlacklist(db, "dragon feed");
    addValidationBlacklist(db, "Alchemy fee");
    assert.deepEqual(
      listValidationBlacklist(db).map((entry) => entry.description),
      ["Alchemy fee", "dragon feed"],
    );

    const filtered = filterBlacklistedTransactions(db, [
      {
        date: "2026-07-01",
        description: "DRAGON    FEED",
        amount: -8,
        currency: "CHF",
      },
      {
        date: "2026-07-02",
        description: "Potion supplies",
        amount: -18.5,
        currency: "CHF",
      },
    ]);
    assert.deepEqual(
      filtered.map((transaction) => transaction.description),
      ["Potion supplies"],
    );

    const entry = listValidationBlacklist(db).find(
      (candidate) => candidate.description === "dragon feed",
    );
    assert.ok(entry);
    assert.equal(deleteValidationBlacklist(db, entry.id), true);
    assert.equal(deleteValidationBlacklist(db, entry.id), false);
  });
});
