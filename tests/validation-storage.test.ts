import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  attachValidationReferencesToRows,
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
  ExtractedDocumentTransaction,
  ValidationAppTransaction,
  ValidationDiff,
} from "../lib/validation-types";
import {
  completeValidation,
  createValidation,
  createValidationManualMatch,
  deleteValidation,
  deleteValidationManualMatch,
  enqueueValidation,
  failValidation,
  filterValidationTransactionsForRange,
  getValidation,
  getValidationThumbnail,
  getWalletValidationTransactions,
  listValidations,
  recomputeValidationDiff,
  updateValidationDiff,
} from "../lib/validations";

const previousCompatibility = process.env.SQLITE_LEDGER_COMPATIBILITY;
delete process.env.SQLITE_LEDGER_COMPATIBILITY;

after(() => {
  if (previousCompatibility === undefined) {
    delete process.env.SQLITE_LEDGER_COMPATIBILITY;
  } else {
    process.env.SQLITE_LEDGER_COMPATIBILITY = previousCompatibility;
  }
});

async function withDatabase(
  run: (db: Db) => void | Promise<void>,
): Promise<void> {
  const db = openDatabase(":memory:");
  try {
    await run(db);
  } finally {
    db.close();
  }
}

const accountId = "c633567e-3de8-4d0c-b47b-c24520ae9e15";

const statementTransaction: ExtractedDocumentTransaction = {
  date: "2026-07-01",
  description: "Potion supplies",
  amount: -18.5,
  currency: "CHF",
};

const document: ExtractedDocument = {
  title: "Crystal Bank statement",
  printDate: "2026-07-14",
  issuer: "Crystal Bank",
  accountReference: "moon-42",
  documentCurrency: "CHF",
  metadata: { period: "July 2026" },
  transactions: [statementTransaction],
};

const actualTransaction: ValidationAppTransaction = {
  id: "888236a4-d065-4504-85ae-3ef13c7af540",
  accountId,
  fingerprint: "actual:moon:potion-supplies",
  date: "2026-07-01T12:00:00.000Z",
  wallet: "Moon Purse",
  type: "Expense",
  categoryName: "Alchemy",
  amount: -18.5,
  currency: "CHF",
  note: "Potion supplies",
};

const emptyDiff: ValidationDiff = {
  matching: [],
  missingInApp: [],
  missingInDocument: [],
};

function completeRun(
  db: Db,
  input: {
    document?: ExtractedDocument;
    diff?: ValidationDiff;
    wallet?: string;
    accountId?: string;
    title?: string;
  } = {},
) {
  const runDocument = {
    ...(input.document ?? document),
    title: input.title ?? input.document?.title ?? document.title,
  };
  const id = enqueueValidation(db, {
    wallet: input.wallet ?? actualTransaction.wallet,
    accountId: input.accountId ?? accountId,
    filename: `${runDocument.title}.pdf`,
    pdf: Buffer.from("%PDF-fantasy"),
  });
  completeValidation(db, id, {
    document: runDocument,
    rawOpenAI: { responseId: "fantasy-response" },
    dateFrom: "2026-07-01",
    dateTo: "2026-07-03",
    thumbnail: Buffer.from("fantasy-thumbnail"),
    diff: input.diff ?? emptyDiff,
    model: "fantasy-model",
  });
  return id;
}

test("validation artifacts persist without creating a local transaction ledger", async () => {
  await withDatabase(async (db) => {
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'",
        )
        .get(),
      undefined,
    );

    const id = enqueueValidation(db, {
      wallet: actualTransaction.wallet,
      accountId,
      filename: "crystal-statement.pdf",
      pdf: Buffer.from("%PDF-fantasy"),
    });
    const queued = await getValidation(db, id, () => {
      throw new Error("processing validations must not request transactions");
    });
    assert.equal(queued?.status, "processing");
    assert.equal(queued?.accountId, accountId);
    assert.deepEqual(queued?.diff, emptyDiff);

    const diff: ValidationDiff = {
      matching: [{ document: statementTransaction, app: actualTransaction }],
      missingInApp: [],
      missingInDocument: [],
    };
    completeValidation(db, id, {
      document,
      rawOpenAI: { responseId: "fantasy-response" },
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      thumbnail: Buffer.from("fantasy-thumbnail"),
      diff,
      model: "fantasy-model",
    });

    const completed = await getValidation(db, id, [actualTransaction]);
    assert.equal(completed?.status, "complete");
    assert.equal(completed?.accountId, accountId);
    assert.deepEqual(completed?.metadata, document.metadata);
    assert.deepEqual(completed?.rawOpenAI, {
      responseId: "fantasy-response",
    });
    assert.deepEqual(completed?.diff, diff);
    assert.deepEqual(
      getValidationThumbnail(db, id),
      Buffer.from("fantasy-thumbnail"),
    );
    assert.equal(listValidations(db)[0].accountId, accountId);
    assert.deepEqual(listValidations(db)[0].counts, {
      matching: 1,
      missingInApp: 0,
      missingInDocument: 0,
    });

    const updatedDiff = {
      ...emptyDiff,
      missingInDocument: [actualTransaction],
    };
    updateValidationDiff(db, id, updatedDiff);
    assert.deepEqual(
      (await getValidation(db, id, [actualTransaction]))?.diff,
      updatedDiff,
    );
    assert.throws(
      () =>
        getWalletValidationTransactions(
          db,
          "Moon Purse",
          "2026-07-01",
          "2026-07-02",
        ),
      /Supply live Actual Budget transactions/,
    );
  });
});

test("failed, directly created, and deleted validation runs retain their storage behavior", async () => {
  await withDatabase(async (db) => {
    const failedId = enqueueValidation(db, {
      wallet: "Moon Purse",
      accountId,
      filename: "broken.pdf",
      pdf: Buffer.from("%PDF-broken"),
    });
    failValidation(db, failedId, "The document is enchanted.");
    const failed = await getValidation(db, failedId, []);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.error, "The document is enchanted.");

    const created = createValidation(db, {
      wallet: "Crystal Vault",
      accountId: "6d1029ec-42d4-46e1-9d62-ce2d082cf78f",
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
    assert.equal(await getValidation(db, 999_999, []), null);
    assert.equal(getValidationThumbnail(db, 999_999), null);
    assert.equal(deleteValidation(db, created!.id), true);
    assert.equal(deleteValidation(db, created!.id), false);
  });
});

test("live validation ranges use stable account IDs, inclusive dates, and exclude transfers", () => {
  const rows = filterValidationTransactionsForRange(
    [
      { ...actualTransaction, wallet: "Renamed Moon Purse" },
      {
        ...actualTransaction,
        id: "end-boundary",
        date: "2026-07-02T23:59:59.000Z",
        wallet: "Renamed Moon Purse",
      },
      {
        ...actualTransaction,
        id: "outside-range",
        date: "2026-07-03T00:00:00.000Z",
      },
      {
        ...actualTransaction,
        id: "wrong-account",
        accountId: "other-account",
        wallet: "Moon Purse",
      },
      {
        ...actualTransaction,
        id: "transfer",
        type: "Outgoing Transfer",
      },
    ],
    {
      accountId,
      wallet: "Moon Purse",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
    },
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    [actualTransaction.id, "end-boundary"],
  );
});

test("transaction references reconcile the full Actual range before pagination and prefer the newest run", async () => {
  await withDatabase(async (db) => {
    const first = { ...actualTransaction, wallet: "Renamed Moon Purse" };
    const second = {
      ...first,
      id: "5b1af536-8535-48c9-b1c3-cd2e913be1a1",
      fingerprint: "actual:moon:second-potion",
      note: "Second candidate",
    };
    const createRun = (title: string) =>
      completeRun(db, {
        title,
        wallet: "Original Moon Purse",
        diff: {
          matching: [{ document: statementTransaction, app: first }],
          missingInApp: [],
          missingInDocument: [second],
        },
      });
    const olderId = createRun("Older statement");
    const newestId = createRun("Newest statement");
    db.prepare(
      "UPDATE validation_runs SET created_at = '2026-07-01 12:00:00' WHERE id IN (?, ?)",
    ).run(olderId, newestId);

    const secondPage = attachValidationReferencesToRows(
      db,
      [second],
      [first, second],
    );
    assert.equal(secondPage[0].validation, null);
    const firstPage = attachValidationReferencesToRows(
      db,
      [first],
      [first, second],
    );
    assert.deepEqual(firstPage[0].validation, {
      id: newestId,
      title: "Newest statement",
      description: statementTransaction.description,
    });
  });
});

test("manual matches use live UUID rows and survive account renames and row replacement", async () => {
  await withDatabase(async (db) => {
    const manualDocumentTransaction = {
      date: "2026-07-03",
      description: "Comet bakery",
      amount: -18,
      currency: "CHF",
    };
    const candidate: ValidationAppTransaction = {
      ...actualTransaction,
      id: "98c66607-078b-41f3-af5d-48f4143ebfe1",
      fingerprint: "actual:stable-import:comet",
      date: "2026-07-02",
      amount: -18,
      categoryName: "Food",
      note: "Comet cafe",
    };
    const validationId = completeRun(db, {
      document: { ...document, transactions: [manualDocumentTransaction] },
      diff: {
        matching: [],
        missingInApp: [manualDocumentTransaction],
        missingInDocument: [candidate],
      },
    });
    const validation = await getValidation(db, validationId, [candidate]);
    assert.equal(validation?.suggestions[0].app.id, candidate.id);

    const matched = await createValidationManualMatch(
      db,
      validationId,
      validation!.suggestions[0].documentKey,
      candidate.fingerprint!,
      [candidate],
    );
    assert.equal(matched?.diff.matching[0].manual, true);
    assert.equal(typeof matched?.diff.matching[0].app.id, "string");

    const replacement = {
      ...candidate,
      id: "144b8e6c-f06f-4555-95f8-f8391632707c",
      wallet: "Moon Purse Renamed",
    };
    const fresh = await getValidation(db, validationId, [replacement]);
    assert.equal(fresh?.diff.matching[0].manual, true);
    assert.equal(fresh?.diff.matching[0].app.id, replacement.id);

    const unmatched = await deleteValidationManualMatch(
      db,
      validationId,
      validation!.suggestions[0].documentKey,
      [replacement],
    );
    assert.equal(unmatched?.diff.matching.length, 0);
    assert.equal(unmatched?.diff.missingInApp.length, 1);
    assert.equal(unmatched?.suggestions[0].app.id, replacement.id);
  });
});

test("deleting one manual match keeps the remaining live matches in the persisted diff", async () => {
  await withDatabase(async (db) => {
    const documents: ExtractedDocumentTransaction[] = [
      {
        date: "2026-07-02",
        description: "Comet bakery",
        amount: -18,
        currency: "CHF",
      },
      {
        date: "2026-07-03",
        description: "Dragon tram",
        amount: -7,
        currency: "CHF",
      },
    ];
    const candidates: ValidationAppTransaction[] = [
      {
        ...actualTransaction,
        id: "5ce8997e-676f-44f9-9730-4925c42e670b",
        fingerprint: "actual:stable-import:comet-bakery",
        date: "2026-07-01",
        amount: -18,
        note: "Comet cafe",
      },
      {
        ...actualTransaction,
        id: "eae7d902-3fbc-429d-bf04-ee46ac944bc5",
        fingerprint: "actual:stable-import:dragon-tram",
        date: "2026-07-02",
        amount: -7,
        note: "Dragon transit",
      },
    ];
    const validationId = completeRun(db, {
      document: { ...document, transactions: documents },
      diff: {
        matching: [],
        missingInApp: documents,
        missingInDocument: candidates,
      },
    });

    const initial = await getValidation(db, validationId, candidates);
    assert.equal(initial?.suggestions.length, 2);
    const first = initial!.suggestions[0];
    const afterFirst = await createValidationManualMatch(
      db,
      validationId,
      first.documentKey,
      first.app.fingerprint!,
      candidates,
    );
    const second = afterFirst!.suggestions[0];
    await createValidationManualMatch(
      db,
      validationId,
      second.documentKey,
      second.app.fingerprint!,
      candidates,
    );

    const afterDelete = await deleteValidationManualMatch(
      db,
      validationId,
      first.documentKey,
      candidates,
    );
    assert.equal(afterDelete?.diff.matching.length, 1);
    assert.equal(afterDelete?.diff.matching[0].app.id, second.app.id);
    const persisted = db
      .prepare("SELECT diff_json AS diffJson FROM validation_runs WHERE id = ?")
      .get(validationId) as { diffJson: string };
    const persistedDiff = JSON.parse(persisted.diffJson) as ValidationDiff;
    assert.equal(persistedDiff.matching.length, 1);
    assert.equal(persistedDiff.matching[0].app.id, second.app.id);
  });
});

test("blacklist recomputation preserves stored manual links for later restoration", async () => {
  await withDatabase(async (db) => {
    const manualDocumentTransaction = {
      date: "2026-07-03",
      description: "Comet bakery",
      amount: -18,
      currency: "CHF",
    };
    const candidate: ValidationAppTransaction = {
      ...actualTransaction,
      id: "5b956cd1-af75-460e-9bc3-b834ce8b03f8",
      fingerprint: "actual:stable-import:blacklist-comet",
      date: "2026-07-02",
      amount: -18,
      note: "Comet cafe",
    };
    const validationId = completeRun(db, {
      document: { ...document, transactions: [manualDocumentTransaction] },
      diff: {
        matching: [],
        missingInApp: [manualDocumentTransaction],
        missingInDocument: [candidate],
      },
    });
    const validation = await getValidation(db, validationId, [candidate]);
    await createValidationManualMatch(
      db,
      validationId,
      validation!.suggestions[0].documentKey,
      candidate.fingerprint!,
      [candidate],
    );

    addValidationBlacklist(db, manualDocumentTransaction.description);
    const blacklisted = await recomputeValidationDiff(db, validationId, [
      candidate,
    ]);
    assert.equal(blacklisted?.diff.matching.length, 0);
    assert.equal(blacklisted?.diff.missingInApp.length, 0);
    assert.equal(blacklisted?.diff.missingInDocument[0].id, candidate.id);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM validation_manual_matches WHERE validation_id = ?",
          )
          .get(validationId) as { count: number }
      ).count,
      1,
    );

    const entry = listValidationBlacklist(db)[0];
    assert.equal(deleteValidationBlacklist(db, entry.id), true);
    const restored = await recomputeValidationDiff(db, validationId, [
      candidate,
    ]);
    assert.equal(restored?.diff.matching[0].manual, true);
    assert.equal(restored?.diff.matching[0].app.id, candidate.id);
  });
});

test("description blacklist normalizes, de-duplicates, filters, and deletes entries", async () => {
  await withDatabase((db) => {
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
    assert.deepEqual(
      filterBlacklistedTransactions(db, [
        {
          date: "2026-07-01",
          description: "DRAGON    FEED",
          amount: -8,
          currency: "CHF",
        },
        statementTransaction,
      ]).map((transaction) => transaction.description),
      [statementTransaction.description],
    );
    const entry = listValidationBlacklist(db).find(
      (candidate) => candidate.description === "dragon feed",
    );
    assert.ok(entry);
    assert.equal(deleteValidationBlacklist(db, entry.id), true);
    assert.equal(deleteValidationBlacklist(db, entry.id), false);
  });
});
