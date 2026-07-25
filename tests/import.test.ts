import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { rmSync } from "node:fs";
import {
  getCategoryDetails,
  getWalletSummaries,
  getWalletTransactions,
  importTransactions,
  openDatabase,
  reviewReconciliation,
  resolveCategory,
  setCategoryTags,
  getMonthlyReport,
  setMonthlyReportColumns,
  setWalletStartingBalance,
} from "../lib/db";
import { parseImportFile } from "../lib/import-xlsx";
import type { TransactionInput } from "../lib/types";
import { calculateDayTotals, formatDayLabel } from "../lib/day-groups";
import { categorySlug } from "../lib/category-slug";

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
  assert.deepEqual(first, { importId: 1, total: 1, imported: 1, duplicates: 0, changes: 0, deletions: 0 });
  assert.deepEqual(second, { importId: 2, total: 2, imported: 0, duplicates: 2, changes: 0, deletions: 0 });
  assert.equal((db.prepare("SELECT COUNT(*) count FROM transactions").get() as { count: number }).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM duplicates").get() as { count: number }).count, 2);
  db.close();
});

test("queues changed values and full-import deletions until explicitly approved", () => {
  const path = `/tmp/spendee-reconcile-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const base: TransactionInput = {
    date: "2026-04-01T11:58:51.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Food & Drink",
    amount: -12.5,
    currency: "CHF",
    note: null,
    labels: null,
    author: "Benjamin",
  };
  const missing = { ...base, date: "2026-04-02T11:58:51.000Z", amount: -20 };
  importTransactions(db, "initial.xlsx", [
    { transaction: base, sourceRow: 2, raw: base },
    { transaction: missing, sourceRow: 3, raw: missing },
  ]);
  const changed = { ...base, amount: -15.75 };
  const result = importTransactions(
    db,
    "full.xlsx",
    [{ transaction: changed, sourceRow: 2, raw: changed }],
    { fullImport: true },
  );
  assert.deepEqual(result, { importId: 2, total: 1, imported: 0, duplicates: 0, changes: 1, deletions: 1 });
  assert.equal((db.prepare("SELECT amount FROM transactions WHERE date = ?").get(base.date) as { amount: number }).amount, -12.5);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM transactions WHERE deleted_at IS NULL").get() as { count: number }).count, 2);

  const pending = db.prepare("SELECT id, action FROM reconciliation_items WHERE status = 'pending' ORDER BY id").all() as Array<{ id: number; action: string }>;
  reviewReconciliation(db, pending.map((item) => item.id), "approved");
  assert.equal((db.prepare("SELECT amount FROM transactions WHERE date = ?").get(base.date) as { amount: number }).amount, -15.75);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM transactions WHERE deleted_at IS NULL").get() as { count: number }).count, 1);
  db.close();
});

test("keeps only proposals from the newest full wallet snapshot", () => {
  const path = `/tmp/spendee-supersede-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const first: TransactionInput = {
    date: "2026-04-01T11:58:51.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Food",
    amount: -10,
    currency: "CHF",
    note: null,
    labels: null,
    author: "Benjamin",
  };
  const second = { ...first, date: "2026-04-02T11:58:51.000Z", amount: -20 };
  importTransactions(db, "initial.xlsx", [
    { transaction: first, sourceRow: 2, raw: first },
    { transaction: second, sourceRow: 3, raw: second },
  ]);
  importTransactions(
    db,
    "changed.xlsx",
    [{ transaction: { ...first, amount: -15 }, sourceRow: 2, raw: first }],
    { fullImport: true },
  );
  importTransactions(
    db,
    "latest.xlsx",
    [
      { transaction: first, sourceRow: 2, raw: first },
      { transaction: second, sourceRow: 3, raw: second },
    ],
    { fullImport: true },
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM reconciliation_items WHERE status = 'pending'").get() as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) count FROM reconciliation_items WHERE status = 'rejected'").get() as { count: number }).count,
    2,
  );
  db.close();
});

test("calculates active wallet totals and paginated wallet details", () => {
  const path = `/tmp/spendee-wallet-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const base: TransactionInput = {
    date: "2026-04-01T11:58:51.000Z",
    wallet: "Daily cash",
    type: "Income",
    categoryName: "Salary",
    amount: 100,
    currency: "CHF",
    note: null,
    labels: null,
    author: "Benjamin",
  };
  const expense = { ...base, date: "2026-04-02T11:58:51.000Z", type: "Expense", amount: -35 };
  importTransactions(db, "wallet.xlsx", [
    { transaction: base, sourceRow: 2, raw: base },
    { transaction: expense, sourceRow: 3, raw: expense },
  ]);
  assert.deepEqual(getWalletSummaries(db), [{
    wallet: "Daily cash",
    transactionCount: 2,
    currency: "CHF",
    transactionTotal: 65,
    startingAmount: 0,
    total: 65,
  }]);
  const details = getWalletTransactions(db, "Daily cash", 1, 10);
  assert.equal(details.total, 2);
  assert.deepEqual(details.totals, [{
    currency: "CHF",
    transactionTotal: 65,
    startingAmount: 0,
    total: 65,
  }]);
  assert.equal(details.rows.length, 2);
  setWalletStartingBalance(db, "Daily cash", "CHF", 250);
  assert.deepEqual(getWalletTransactions(db, "Daily cash", 1, 10).totals, [{
    currency: "CHF",
    transactionTotal: 65,
    startingAmount: 250,
    total: 315,
  }]);
  db.close();
});

test("aggregates category spending by tag across wallets", () => {
  const path = `/tmp/spendee-category-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const base: TransactionInput = {
    date: "2026-04-01T11:58:51.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Food & Drink",
    amount: -30,
    currency: "CHF",
    note: null,
    labels: "lunch,work",
    author: "Benjamin",
  };
  const cash = {
    ...base,
    date: "2026-04-02T11:58:51.000Z",
    wallet: "Cash",
    amount: -20,
    labels: "lunch",
  };
  const untagged = {
    ...base,
    date: "2026-04-03T11:58:51.000Z",
    wallet: "Cash",
    amount: -10,
    labels: null,
  };
  const refund = {
    ...base,
    date: "2026-04-04T11:58:51.000Z",
    type: "Income",
    amount: 10,
    labels: "lunch",
  };
  importTransactions(db, "categories.xlsx", [
    { transaction: base, sourceRow: 2, raw: base },
    { transaction: cash, sourceRow: 3, raw: cash },
    { transaction: untagged, sourceRow: 4, raw: untagged },
    { transaction: refund, sourceRow: 5, raw: refund },
  ]);
  const details = getCategoryDetails(db, "Food & Drink", 1, 10);
  assert.equal(details.total, 4);
  assert.deepEqual(details.wallets, [
    { wallet: "Account", transactionCount: 2 },
    { wallet: "Cash", transactionCount: 2 },
  ]);
  assert.deepEqual(details.spendingTotals, [{ currency: "CHF", amount: -50 }]);
  assert.deepEqual(details.availableTags, ["lunch", "work"]);
  assert.deepEqual(details.selectedTags, ["lunch", "work"]);
  assert.equal(details.tagConfigSaved, false);
  assert.deepEqual(details.segments, [
    { tag: "Other", currency: "CHF", amount: -10, transactionCount: 1 },
    { tag: "work", currency: "CHF", amount: -15, transactionCount: 1 },
    { tag: "lunch", currency: "CHF", amount: -25, transactionCount: 3 },
  ]);
  assert.equal(details.segments.reduce((sum, segment) => sum + segment.amount, 0), -50);
  setCategoryTags(db, "Food & Drink", ["work"], false);
  const configured = getCategoryDetails(db, "Food & Drink", 1, 10);
  assert.deepEqual(configured.selectedTags, ["work"]);
  assert.equal(configured.tagConfigSaved, true);
  assert.equal(configured.spendingByTagEnabled, false);
  assert.deepEqual(configured.segments, [
    { tag: "Other", currency: "CHF", amount: -20, transactionCount: 3 },
    { tag: "work", currency: "CHF", amount: -30, transactionCount: 1 },
  ]);
  db.close();
});

test("groups complete daily totals in the Zurich timezone and formats day labels", () => {
  const totals = calculateDayTotals([
    { date: "2026-07-24T22:30:00.000Z", amount: -25, currency: "CHF" },
    { date: "2026-07-25T08:00:00.000Z", amount: 100, currency: "CHF" },
    { date: "2026-07-23T08:00:00.000Z", amount: -12, currency: "CHF" },
  ]);
  assert.deepEqual(totals["2026-07-25"], [{ currency: "CHF", total: 75 }]);
  const now = new Date("2026-07-25T10:00:00.000Z");
  assert.equal(formatDayLabel("2026-07-25", now), "Today");
  assert.equal(formatDayLabel("2026-07-24", now), "Yesterday");
  assert.equal(formatDayLabel("2026-07-23", now), "23. July");
});

test("builds and persists merged monthly category columns", () => {
  const path = `/tmp/spendee-monthly-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const makeTransaction = (
    date: string,
    categoryName: string,
    amount: number,
    currency = "CHF",
  ): TransactionInput => ({
    date,
    wallet: "Account",
    type: "Expense",
    categoryName,
    amount,
    currency,
    note: null,
    labels: null,
    author: "Benjamin",
  });
  const rows = [
    makeTransaction("2025-01-04T10:00:00.000Z", "Groceries", -50),
    makeTransaction("2025-01-08T10:00:00.000Z", "Restaurants", -30),
    { ...makeTransaction("2025-01-10T10:00:00.000Z", "Groceries", 15), type: "Income" },
    makeTransaction("2025-02-03T10:00:00.000Z", "Groceries", -20),
    makeTransaction("2025-02-05T10:00:00.000Z", "Utilities", -100),
  ];
  importTransactions(db, "monthly.xlsx", rows.map((transaction, index) => ({
    transaction,
    sourceRow: index + 2,
    raw: transaction,
  })));
  const defaults = getMonthlyReport(db);
  assert.deepEqual(defaults.categories, ["Groceries", "Restaurants", "Utilities"]);
  assert.equal(defaults.configured, false);

  setMonthlyReportColumns(db, [
    { name: "Food", categories: ["Groceries", "Restaurants"] },
    { name: "Bills", categories: ["Utilities"] },
  ]);
  const report = getMonthlyReport(db);
  assert.equal(report.configured, true);
  assert.deepEqual(report.columns.map(({ name, categories }) => ({ name, categories })), [
    { name: "Food", categories: ["Groceries", "Restaurants"] },
    { name: "Bills", categories: ["Utilities"] },
  ]);
  assert.deepEqual(report.months, [
    {
      month: "2025-02",
      cells: [
        [{ currency: "CHF", expenses: 20, income: 0 }],
        [{ currency: "CHF", expenses: 100, income: 0 }],
      ],
    },
    {
      month: "2025-01",
      cells: [[{ currency: "CHF", expenses: 80, income: 15 }], []],
    },
  ]);
  db.close();
});

test("creates readable category slugs and resolves them to exact category names", () => {
  const path = `/tmp/spendee-category-slug-${crypto.randomUUID()}.db`;
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
    labels: null,
    author: "Benjamin",
  };
  importTransactions(db, "category.xlsx", [{ transaction, sourceRow: 2, raw: transaction }]);
  assert.equal(categorySlug("Food & Drink"), "food-and-drink");
  assert.equal(resolveCategory(db, "food-and-drink"), "Food & Drink");
  assert.equal(resolveCategory(db, "Food%20%26%20Drink"), "Food & Drink");
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
