import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { rmSync } from "node:fs";
import { openDatabase, importTransactions } from "../lib/db";
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
