import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync, rmSync } from "node:fs";
import {
  getCategoryDetails,
  createSplit,
  deleteSplit,
  deleteDuplicates,
  getFilteredTransactionPage,
  getTransactionFilterOptions,
  getValidUntil,
  getWalletSummaries,
  getWalletTransactions,
  importTransactions,
  openDatabase,
  reviewReconciliation,
  resolveCategory,
  setCategoryTags,
  setValidUntil,
  getMonthlyReport,
  getSplit,
  getSplits,
  setMonthlyReportColumns,
  setWalletStartingBalance,
} from "../lib/db";
import { parseImportFile, parseWorkbook } from "../lib/import-xlsx";
import type { TransactionInput } from "../lib/types";
import { calculateDayTotals, formatDayLabel } from "../lib/day-groups";
import { categorySlug } from "../lib/category-slug";
import { parseTransactionFilters } from "../lib/transaction-filters";
import { createSplitPdf } from "../lib/split-pdf";
import { intlLocale, normalizeLocale, translate, translateUiText } from "../lib/i18n";

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
    author: "Nova",
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
  const duplicateIds = (db.prepare("SELECT id FROM duplicates ORDER BY id").all() as Array<{ id: number }>).map((row) => row.id);
  assert.equal(deleteDuplicates(db, duplicateIds.slice(0, 1)), 1);
  assert.equal((db.prepare("SELECT COUNT(*) count FROM duplicates").get() as { count: number }).count, 1);
  db.close();
});

test("persists the global transaction validation date", () => {
  const path = `/tmp/spendee-valid-until-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  assert.equal(getValidUntil(db), null);
  assert.equal(setValidUntil(db, "2026-07-25"), "2026-07-25");
  assert.equal(getValidUntil(db), "2026-07-25");
  assert.equal(setValidUntil(db, null), null);
  assert.equal(getValidUntil(db), null);
  assert.throws(() => setValidUntil(db, "not-a-date"), /must be a date/);
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
    author: "Nova",
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
    author: "Nova",
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
    author: "Nova",
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
    author: "Nova",
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
  const details = getCategoryDetails(db, "Food & Drink", 1, 10, undefined, "2026-04");
  assert.equal(details.total, 4);
  assert.deepEqual(details.wallets, [
    { wallet: "Account", transactionCount: 2 },
    { wallet: "Cash", transactionCount: 2 },
  ]);
  assert.equal(details.chartMonth, "2026-04");
  assert.deepEqual(details.chartTotals, [{ currency: "CHF", amount: -50 }]);
  assert.deepEqual(details.availableTags, ["lunch", "work"]);
  assert.deepEqual(details.selectedTags, ["lunch", "work"]);
  assert.equal(details.tagConfigSaved, false);
  assert.deepEqual(details.segments, [
    { tag: "Other", currency: "CHF", amount: -10, transactionCount: 1 },
    { tag: "work", currency: "CHF", amount: -15, transactionCount: 1 },
    { tag: "lunch", currency: "CHF", amount: -25, transactionCount: 3 },
  ]);
  assert.equal(details.segments.reduce((sum, segment) => sum + segment.amount, 0), -50);
  setCategoryTags(db, "Food & Drink", ["work"], false, 3, "#12c48b");
  const configured = getCategoryDetails(db, "Food & Drink", 1, 10, undefined, "2026-04");
  assert.deepEqual(configured.selectedTags, ["work"]);
  assert.equal(configured.tagConfigSaved, true);
  assert.equal(configured.spendingByTagEnabled, false);
  assert.deepEqual(configured.appearance, { iconId: 3, color: "#12c48b" });
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
    author: "Nova",
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
    { name: "Food", categories: ["Groceries", "Restaurants"], budget: 75 },
    { name: "Bills", categories: ["Utilities"], budget: null },
  ]);
  const report = getMonthlyReport(db);
  assert.equal(report.configured, true);
  assert.deepEqual(report.columns.map(({ name, categories, budget }) => ({ name, categories, budget })), [
    { name: "Food", categories: ["Groceries", "Restaurants"], budget: 75 },
    { name: "Bills", categories: ["Utilities"], budget: null },
  ]);
  assert.deepEqual(report.months, [
    {
      month: "2025-02",
      cells: [
        [{ currency: "CHF", amount: -20 }],
        [{ currency: "CHF", amount: -100 }],
      ],
    },
    {
      month: "2025-01",
      cells: [[{ currency: "CHF", amount: -65 }], []],
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
    author: "Nova",
  };
  importTransactions(db, "category.xlsx", [{ transaction, sourceRow: 2, raw: transaction }]);
  assert.equal(categorySlug("Food & Drink"), "food-and-drink");
  assert.equal(resolveCategory(db, "food-and-drink"), "Food & Drink");
  assert.equal(resolveCategory(db, "Food%20%26%20Drink"), "Food & Drink");
  db.close();
});

test("filters paginated transactions by multi-value fields, dates, tags, and amount", () => {
  const path = `/tmp/spendee-filters-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const base: TransactionInput = {
    date: "2026-04-01T10:00:00.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Food & Drink",
    amount: -45,
    currency: "CHF",
    note: null,
    labels: "food, work",
    author: "Nova",
  };
  const rows: TransactionInput[] = [
    base,
    { ...base, date: "2026-04-02T10:00:00.000Z", wallet: "Cash", amount: -12, labels: "food", author: "Orion" },
    { ...base, date: "2026-05-02T10:00:00.000Z", type: "Income", categoryName: "Salary", amount: 500, labels: null },
  ];
  importTransactions(db, "filters.xlsx", rows.map((transaction, index) => ({
    transaction,
    sourceRow: index + 2,
    raw: transaction,
  })));
  const params = new URLSearchParams([
    ["dateFrom", "2026-04-01"],
    ["dateTo", "2026-04-30"],
    ["wallet", "Account"],
    ["wallet", "Cash"],
    ["type", "Expense"],
    ["category", "Food & Drink"],
    ["tag", "work"],
    ["author", "Nova"],
    ["amountOperator", "gt"],
    ["amount", "40"],
  ]);
  const page = getFilteredTransactionPage(
    db, "transactions", parseTransactionFilters(params), 1, 25,
  );
  assert.equal(page.total, 1);
  assert.equal((page.rows[0] as { amount: number }).amount, -45);
  assert.deepEqual(Object.keys(page.dayTotals), ["2026-04-01"]);
  const filterOptions = getTransactionFilterOptions(db);
  assert.deepEqual({
    wallets: filterOptions.wallets,
    types: filterOptions.types,
    categories: filterOptions.categories,
    tags: filterOptions.tags,
    authors: filterOptions.authors,
    categoryAppearances: filterOptions.categoryAppearances,
  }, {
    wallets: ["Account", "Cash"],
    types: ["Expense", "Income"],
    categories: ["Food & Drink", "Salary"],
    tags: ["food", "work"],
    authors: ["Nova", "Orion"],
    categoryAppearances: {},
  });
  assert.match(filterOptions.currentMonth, /^\d{4}-\d{2}$/);
  db.close();
});

test("persists split snapshots, custom positions, totals, deletion, and a valid PDF", async () => {
  const path = `/tmp/spendee-splits-${crypto.randomUUID()}.db`;
  paths.push(path);
  const db = openDatabase(path);
  const base: TransactionInput = {
    date: "2026-04-01T10:00:00.000Z",
    wallet: "Account",
    type: "Expense",
    categoryName: "Groceries",
    amount: -40,
    currency: "CHF",
    note: "Weekly shop",
    labels: null,
    author: "Nova",
  };
  const second = { ...base, date: "2026-04-02T10:00:00.000Z", amount: -20, note: "Bakery" };
  importTransactions(db, "split.xlsx", [
    { transaction: base, sourceRow: 2, raw: base },
    { transaction: second, sourceRow: 3, raw: second },
  ]);
  const ids = (db.prepare("SELECT id FROM transactions ORDER BY id").all() as Array<{ id: number }>)
    .map((row) => row.id);
  const split = createSplit(db, "Mountain weekend", ids, [{ description: "Refund", amount: 10 }], 2);
  assert.ok(split);
  assert.equal(split?.title, "Mountain weekend");
  assert.equal(split?.totalAmount, -50);
  assert.equal(split?.splitAmount, -25);
  assert.equal(split?.splitCount, 2);
  assert.equal(split?.locale, "en");
  assert.equal(split?.entries.length, 3);
  assert.deepEqual(
    getSplits(db).map((item) => ({
      title: (item as { title: string }).title,
      customCount: (item as { customCount: number }).customCount,
    })),
    [{ title: "Mountain weekend", customCount: 1 }],
  );
  const pdf = await createSplitPdf(split as Parameters<typeof createSplitPdf>[0]);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
  assert.equal(deleteSplit(db, split!.id), true);
  assert.equal(getSplit(db, split!.id), null);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM split_entries").get() as { count: number }).count, 0);
  db.close();
});

test("provides locale normalization, formatting metadata, and message fallback", () => {
  assert.equal(normalizeLocale("en"), "en");
  assert.equal(normalizeLocale("de"), "de");
  assert.equal(normalizeLocale("unknown"), "en");
  assert.equal(intlLocale("de"), "de-CH");
  assert.equal(translate("de", "split.pdf.total"), "GESAMT");
  assert.equal(translateUiText("de", "Transactions"), "Transaktionen");
  assert.equal(translateUiText("de", "Page 2 of 7"), "Seite 2 von 7");
  assert.equal(translateUiText("de", "23. July"), "23. Juli");
  assert.equal(translateUiText("de", "Dragon transaction journal"), "Dragon transaction journal");
  assert.equal(intlLocale("en"), "en-CH");
  assert.equal(translate("en", "split.pdf.page", { page: 3 }), "Page 3");
  assert.equal(translate("en", "future.message"), "future.message");
});

test("parses quoted CSV exports with the same transaction schema", async () => {
  const csv = [
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author",
    '2026-04-01T11:58:51+00:00,Account,Expense,Food & Drink,-12.50,CHF,"Lunch, coffee","food,work",Nova Quill',
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
    author: "Nova Quill",
  });
});

test("parses semicolon-delimited CSV exports", async () => {
  const csv = [
    "Date;Wallet;Type;Category name;Amount;Currency;Note;Labels;Author",
    "2026-04-01T11:58:51+00:00;Cash;Income;Refund;22;CHF;;;Nova Quill",
  ].join("\n");
  const rows = await parseImportFile(Buffer.from(csv), "transactions.csv");
  assert.equal(rows[0].transaction.wallet, "Cash");
  assert.equal(rows[0].transaction.amount, 22);
});

test("rejects malformed and unsupported import files with useful errors", async () => {
  await assert.rejects(() => parseImportFile(Buffer.from(""), "empty.csv"), /readable transaction table/);
  await assert.rejects(() => parseImportFile(Buffer.from("Date,Wallet\n"), "missing.csv"), /Missing required columns/);
  const header = "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author";
  await assert.rejects(
    () => parseImportFile(Buffer.from(`${header}\nnot-a-date,Moon Purse,Expense,Potions,-4,CHF,,,Nova Quill`), "date.csv"),
    /Invalid date/,
  );
  await assert.rejects(
    () => parseImportFile(Buffer.from(`${header}\n2026-07-01,Moon Purse,Expense,Potions,dragon,CHF,,,Nova Quill`), "amount.csv"),
    /invalid amount/,
  );
  await assert.rejects(
    () => parseImportFile(Buffer.from(`${header}\n2026-07-01,,Expense,Potions,-4,CHF,,,Nova Quill`), "wallet.csv"),
    /wallet, type and currency are required/,
  );
  await assert.rejects(() => parseImportFile(Buffer.from("fantasy"), "ledger.json"), /Only .xlsx and .csv/);
  assert.deepEqual(await parseImportFile(Buffer.from(`${header}\n`), "header-only.csv"), []);
});

test("parses a synthetic fantasy XLSX export", async () => {
  const rows = await parseWorkbook(readFileSync("tests/fixtures/fantasy-transactions.xlsx"));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.transaction), [
    {
      date: "2026-07-14T09:30:00.000Z",
      wallet: "Crystal Satchel",
      type: "Expense",
      categoryName: "Potion Supplies",
      amount: -18.5,
      currency: "CHF",
      note: "Silverleaf tonic",
      labels: "alchemy, quest",
      author: "Nova Quill",
    },
    {
      date: "2026-07-15T12:00:00.000Z",
      wallet: "Crystal Satchel",
      type: "Income",
      categoryName: "Guild Rewards",
      amount: 75,
      currency: "CHF",
      note: "Wyvern mission",
      labels: "quest",
      author: "Orion Vale",
    },
  ]);
});
