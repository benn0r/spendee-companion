import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { rmSync } from "node:fs";
import { openDatabase, importTransactions } from "../lib/db";
import { parseImportFile } from "../lib/import-xlsx";
import type { TransactionInput } from "../lib/types";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { force: true });
});

test("persists unique transactions and separates every duplicate occurrence", () => {
  const path = `/tmp/spendee-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const transaction: TransactionInput = {
    date: "2026-04-01T11:58:51.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Food & Drink",
    amount: -12.5,
    currency: "CHF",
    note: null,
    labels: "lunch",
    author: "Benjamin",
  };
  const first = importTransactions(db, "first.xlsx", [{ transaction, sourceRow: 2, raw: transaction }]);
  const second = importTransactions(db, "second.xlsx", [
    { transaction, sourceRow: 2, raw: transaction },
    { transaction, sourceRow: 3, raw: transaction },
  ]);
  assert.deepEqual(first, { importId: 1, total: 1, imported: 1, duplicates: 0 });
  assert.deepEqual(second, { importId: 2, total: 2, imported: 0, duplicates: 2 });
  assert.equal((db.prepare("SELECT COUNT(*) count FROM transactions").get() as { count: number }).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM duplicates").get() as { count: number }).count, 2);
  db.close();
});

test("parses quoted CSV exports with the same transaction schema", async () => {
  const csv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    '2026-04-01T11:58:51+00:00,Account,Expense,Food & Drink,-12.50,CHF,"Lunch, coffee","food,work",Spendee Contributors',
  ].join("\n");
  const rows = await parseImportFile(Buffer.from(csv), "transactions.csv");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].transaction, {
    date: "2026-04-01T11:58:51.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Food & Drink",
    amount: -12.5,
    currency: "CHF",
    note: "Lunch, coffee",
    labels: "food,work",
    author: "Spendee Contributors",
  });
});

test("parses semicolon-delimited CSV exports", async () => {
  const csv = [
    "Date;Wallet;Type;Category name;Amount;Currency;Note;Labels;Author",
    "2026-04-01T11:58:51+00:00;Cash;Income;Refund;22;CHF;;;Spendee Contributors",
  ].join("\n");
  const rows = await parseImportFile(Buffer.from(csv), "transactions.csv");
  assert.equal(rows[0].transaction.wallet, "Cash");
  assert.equal(rows[0].transaction.amount, 22);
});
