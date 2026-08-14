import assert from "node:assert/strict";
import { readFileSync, rmSync, unlinkSync } from "node:fs";
import { after, test } from "node:test";
import { ActualMockFileAdapter } from "../lib/actual-adapter";
import { openDatabase } from "../lib/db";
import { getLedgerSnapshot } from "../lib/ledger-service";
import {
  createMobileTransaction,
  deleteMobileTransaction,
  mobileTransactionSchema,
} from "../lib/mobile-transactions";
import {
  ensureMerchantTags,
  extractReceiptSuggestion,
} from "../lib/openai-receipt";
import type { ReceiptSuggestion } from "../lib/receipt-types";
import {
  completeReceipt,
  deleteReceipt,
  failReceipt,
  getReceipt,
  listReceipts,
  markReceiptSubmitted,
  nextQueuedReceipt,
  readReceiptFile,
  saveReceipt,
  toReceiptApiRecord,
} from "../lib/receipts";
import {
  actualIds,
  createActualApiFixture,
  writeActualApiFixture,
} from "./support/actual-api-fixture";

const databasePath = `/tmp/spendee-receipts-${crypto.randomUUID()}.db`;
const receiptsPath = `/tmp/spendee-receipts-files-${crypto.randomUUID()}`;
const actualPath = `/tmp/spendee-receipts-actual-${crypto.randomUUID()}.json`;
process.env.RECEIPTS_DIR = receiptsPath;

const suggestion: ReceiptSuggestion = {
  merchant: "Moonberry Market",
  date: "2026-07-15",
  amount: -12.5,
  currency: "CHF",
  category: actualIds.enchantedGroceries,
  notes: "Moonberry tonic",
  tags: [actualIds.pantryTag],
  items: [
    {
      description: "Moonberry tonic",
      quantity: 1,
      unitAmount: -12.5,
      totalAmount: -12.5,
      category: actualIds.enchantedGroceries,
    },
  ],
  splits: [],
  confidence: 0.98,
};

after(() => {
  for (const path of [
    databasePath,
    `${databasePath}-shm`,
    `${databasePath}-wal`,
    receiptsPath,
    actualPath,
  ]) {
    rmSync(path, {
      force: true,
      recursive: path === receiptsPath,
    });
  }
});

test("receipt storage retains metadata and private files through its lifecycle", async () => {
  const db = openDatabase(databasePath);
  try {
    await assert.rejects(
      saveReceipt(db, {
        filename: "bad.txt",
        mimeType: "text/plain",
        data: Buffer.from("bad"),
        accountId: actualIds.moonAccount,
        accountName: "Moon Purse",
      }),
      /Unsupported receipt type/,
    );
    await assert.rejects(
      saveReceipt(db, {
        filename: "empty.png",
        mimeType: "image/png",
        data: Buffer.alloc(0),
        accountId: actualIds.moonAccount,
        accountName: "Moon Purse",
      }),
      /between 1 byte and 10 MB/,
    );

    const id = await saveReceipt(db, {
      filename: "moonberry.png",
      mimeType: "image/png",
      data: Buffer.from("fantasy-image"),
      accountId: actualIds.moonAccount,
      accountName: "Moon Purse",
    });
    assert.equal(listReceipts(db).length, 1);
    const queued = nextQueuedReceipt(db);
    assert.equal(queued?.id, id);
    assert.equal(queued?.status, "processing");
    assert.equal((await readReceiptFile(queued!)).toString(), "fantasy-image");
    assert.equal(nextQueuedReceipt(db), undefined);

    completeReceipt(db, id, suggestion);
    assert.deepEqual(getReceipt(db, id)?.suggestion, suggestion);
    assert.equal("filePath" in toReceiptApiRecord(getReceipt(db, id)!), false);
    markReceiptSubmitted(db, id, "fantasy-actual-id");
    assert.equal(getReceipt(db, id)?.actualTransactionId, "fantasy-actual-id");
    assert.equal(await deleteReceipt(db, id), true);
    assert.equal(await deleteReceipt(db, id), false);

    const failedId = await saveReceipt(db, {
      filename: "failed.pdf",
      mimeType: "application/pdf",
      data: Buffer.from("%PDF-fantasy"),
      accountId: actualIds.moonAccount,
      accountName: "Moon Purse",
    });
    failReceipt(db, failedId, "x".repeat(1_100));
    assert.equal(getReceipt(db, failedId)?.error?.length, 1_000);
    const failed = getReceipt(db, failedId)!;
    unlinkSync(failed.filePath);
    assert.equal(await deleteReceipt(db, failedId), true);
  } finally {
    db.close();
  }
});

test("receipt extraction validates mock output and adds matching merchant tags", async () => {
  const snapshot = createActualApiFixture();
  const merchantTagged = ensureMerchantTags({ ...suggestion, tags: [] }, [
    { id: "merchant-tag", name: "moonberry" },
  ]);
  assert.deepEqual(merchantTagged.tags, ["merchant-tag"]);

  process.env.OPENAI_RECEIPT_MOCK = JSON.stringify(suggestion);
  assert.deepEqual(
    await extractReceiptSuggestion(
      Buffer.from("fantasy"),
      "receipt.png",
      "image/png",
      await getLedgerSnapshot({
        adapter: {
          async getSnapshot() {
            return snapshot;
          },
          async importTransactions() {
            return [];
          },
          invalidateSnapshot() {},
        },
      }),
    ),
    suggestion,
  );
  process.env.OPENAI_RECEIPT_MOCK = JSON.stringify({
    ...suggestion,
    amount: 12.5,
  });
  await assert.rejects(
    extractReceiptSuggestion(
      Buffer.from("fantasy"),
      "receipt.png",
      "image/png",
      await getLedgerSnapshot({
        adapter: {
          async getSnapshot() {
            return snapshot;
          },
          async importTransactions() {
            return [];
          },
          invalidateSnapshot() {},
        },
      }),
    ),
    /invalid receipt suggestion/,
  );
  delete process.env.OPENAI_RECEIPT_MOCK;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    extractReceiptSuggestion(
      Buffer.from("fantasy"),
      "receipt.png",
      "image/png",
      await getLedgerSnapshot({
        adapter: {
          async getSnapshot() {
            return snapshot;
          },
          async importTransactions() {
            return [];
          },
          invalidateSnapshot() {},
        },
      }),
    ),
    /OPENAI_API_KEY is not configured/,
  );
});

test("mobile transaction validation creates idempotent Actual rows and deletes them", async () => {
  writeActualApiFixture(actualPath);
  const adapter = new ActualMockFileAdapter(actualPath);
  const snapshot = await getLedgerSnapshot({ adapter });
  assert.equal(
    mobileTransactionSchema.safeParse({
      account: actualIds.moonAccount,
      date: "2026-07-16",
      amount: -4,
    }).success,
    false,
  );
  assert.equal(
    mobileTransactionSchema.safeParse({
      account: actualIds.moonAccount,
      date: "2026-07-16",
      amount: -4,
      splits: [
        { category: actualIds.enchantedGroceries, amount: -3 },
        { category: actualIds.stardustSnacks, amount: -2 },
      ],
    }).success,
    false,
  );
  const input = mobileTransactionSchema.parse({
    account: actualIds.moonAccount,
    date: "2026-07-16",
    amount: -4,
    payee: "Comet Cafe",
    notes: "Shared snack",
    tags: [actualIds.cosmicTag],
    splits: [
      { category: actualIds.enchantedGroceries, amount: -2 },
      { category: actualIds.stardustSnacks, amount: -2 },
    ],
  });
  const id = await createMobileTransaction(input, {
    adapter,
    snapshot,
    importedId: "fantasy:mobile",
  });
  assert.equal(
    await createMobileTransaction(input, {
      adapter,
      snapshot,
      importedId: "fantasy:mobile",
    }),
    id,
  );
  const written = JSON.parse(readFileSync(actualPath, "utf8"));
  const transaction = written.transactions.find(
    (candidate: { id: string }) => candidate.id === id,
  );
  assert.equal(transaction.cleared, false);
  assert.equal(transaction.subtransactions.length, 2);
  assert.match(transaction.notes, /#cosmic/);
  await deleteMobileTransaction(id, adapter);
  assert.equal(
    JSON.parse(readFileSync(actualPath, "utf8")).transactions.some(
      (candidate: { id: string }) => candidate.id === id,
    ),
    false,
  );
});
