import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, test } from "node:test";
import {
  setActualAdapterForTests,
  type ActualAdapter,
  type ActualSnapshot,
} from "../lib/actual-adapter";

const databasePath = `/tmp/spendee-validation-routes-${crypto.randomUUID()}.db`;
const previousDatabasePath = process.env.SQLITE_PATH;
const previousCompatibility = process.env.SQLITE_LEDGER_COMPATIBILITY;
process.env.SQLITE_PATH = databasePath;
delete process.env.SQLITE_LEDGER_COMPATIBILITY;

const accountId = "e085ff36-4dd4-4489-b7b4-dd0de9601b83";
const transactionId = "cd73bb88-d341-4bfa-bb8c-78c89c9a6c28";
let snapshotReads = 0;

const snapshot: ActualSnapshot = {
  currency: "CHF",
  accounts: [
    {
      id: accountId,
      name: "Renamed Moon Purse",
      offBudget: false,
      closed: false,
      balanceCents: -1_800,
    },
  ],
  categories: [
    {
      id: "fantasy-food",
      name: "Food",
      groupId: "fantasy-expenses",
      isIncome: false,
      hidden: false,
    },
  ],
  tags: [],
  payees: [
    {
      id: "fantasy-comet-cafe",
      name: "Comet Cafe",
      transferAccountId: null,
    },
  ],
  transactions: [
    {
      id: transactionId,
      accountId,
      categoryId: "fantasy-food",
      payeeId: "fantasy-comet-cafe",
      amountCents: -1_800,
      date: "2026-07-02",
      notes: "Comet cafe",
      importedId: "fantasy:comet-cafe",
      transferId: null,
      parentId: null,
      isParent: false,
      isChild: false,
      startingBalance: false,
      cleared: true,
      reconciled: false,
      sortOrder: 1,
      subtransactions: [],
    },
  ],
  budgetMonths: ["2026-07"],
  syncedAt: "2026-08-13T10:00:00.000Z",
};

const adapter: ActualAdapter = {
  async getSnapshot() {
    snapshotReads += 1;
    return structuredClone(snapshot);
  },
  async importTransactions() {
    return [];
  },
  invalidateSnapshot() {},
};

setActualAdapterForTests(adapter);

after(async () => {
  const { getDatabase } = await import("../lib/db");
  getDatabase().close();
  setActualAdapterForTests(null);
  if (previousDatabasePath === undefined) delete process.env.SQLITE_PATH;
  else process.env.SQLITE_PATH = previousDatabasePath;
  if (previousCompatibility === undefined) {
    delete process.env.SQLITE_LEDGER_COMPATIBILITY;
  } else {
    process.env.SQLITE_LEDGER_COMPATIBILITY = previousCompatibility;
  }
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

function jsonRequest(method: string, body: unknown) {
  return new Request("http://test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

test("validation routes reconcile by account ID and preserve manual matches through blacklist changes", async () => {
  const { getDatabase } = await import("../lib/db");
  const { completeValidation, enqueueValidation } =
    await import("../lib/validations");
  const db = getDatabase();
  const documentTransaction = {
    date: "2026-07-03",
    description: "Comet bakery",
    amount: -18,
    currency: "CHF",
  };
  const validationId = enqueueValidation(db, {
    wallet: "Original Moon Purse",
    accountId,
    filename: "moon-statement.pdf",
    pdf: Buffer.from("%PDF-fantasy"),
  });
  completeValidation(db, validationId, {
    document: {
      title: "Moon statement",
      printDate: "2026-07-04",
      issuer: "Crystal Bank",
      accountReference: "moon-42",
      documentCurrency: "CHF",
      metadata: {},
      transactions: [documentTransaction],
    },
    rawOpenAI: {},
    dateFrom: "2026-07-01",
    dateTo: "2026-07-03",
    thumbnail: Buffer.from("fantasy-thumbnail"),
    diff: {
      matching: [],
      missingInApp: [documentTransaction],
      missingInDocument: [],
    },
    model: "fantasy-model",
  });

  const detail = await import("../app/api/validations/[id]/route");
  const matches = await import("../app/api/validations/[id]/matches/route");
  const blacklist = await import("../app/api/validation-blacklist/route");
  const params = { params: Promise.resolve({ id: String(validationId) }) };

  const readsBeforeInvalidRequest = snapshotReads;
  assert.equal(
    (
      await detail.GET(new Request("http://test"), {
        params: Promise.resolve({ id: "invalid" }),
      })
    ).status,
    404,
  );
  assert.equal(snapshotReads, readsBeforeInvalidRequest);

  const validation = await responseBody(
    await detail.GET(new Request("http://test"), params),
  );
  assert.equal(validation.accountId, accountId);
  assert.equal(validation.wallet, "Original Moon Purse");
  assert.equal(validation.suggestions[0].app.id, transactionId);
  assert.equal(validation.suggestions[0].app.wallet, "Renamed Moon Purse");

  const matched = await responseBody(
    await detail.POST(
      jsonRequest("POST", {
        documentKey: validation.suggestions[0].documentKey,
        appFingerprint: validation.suggestions[0].app.fingerprint,
      }),
      params,
    ),
  );
  assert.equal(matched.diff.matching[0].manual, true);
  assert.equal(matched.diff.matching[0].app.id, transactionId);

  const added = await responseBody(
    await blacklist.POST(
      jsonRequest("POST", {
        description: documentTransaction.description,
        validationId,
      }),
    ),
  );
  assert.equal(added.entries.length, 1);
  const whileBlacklisted = await responseBody(
    await detail.GET(new Request("http://test"), params),
  );
  assert.equal(whileBlacklisted.diff.matching.length, 0);
  assert.equal(whileBlacklisted.diff.missingInDocument[0].id, transactionId);
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

  assert.equal(
    (
      await blacklist.DELETE(
        jsonRequest("DELETE", {
          id: added.entries[0].id,
          validationId,
        }),
      )
    ).status,
    200,
  );
  const restored = await responseBody(
    await detail.GET(new Request("http://test"), params),
  );
  assert.equal(restored.diff.matching[0].manual, true);
  assert.equal(restored.diff.matching[0].app.id, transactionId);

  const removed = await responseBody(
    await matches.DELETE(
      jsonRequest("DELETE", {
        documentKey: validation.suggestions[0].documentKey,
      }),
      params,
    ),
  );
  assert.equal(removed.diff.matching.length, 0);
  assert.equal(removed.suggestions[0].app.id, transactionId);
});
