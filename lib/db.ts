import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TransactionInput } from "./types";
import { calculateDayTotals } from "./day-groups";
import { categorySlug } from "./category-slug";

type Db = Database.Database;
let singleton: Db | undefined;

export function openDatabase(filename = process.env.SQLITE_PATH ?? "./data/spendee.db"): Db {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      duplicate_rows INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      wallet TEXT NOT NULL,
      type TEXT NOT NULL,
      category_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      note TEXT,
      labels TEXT,
      author TEXT,
      import_id INTEGER NOT NULL REFERENCES imports(id),
      source_file TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS duplicates (
      id INTEGER PRIMARY KEY,
      duplicate_of_id INTEGER NOT NULL REFERENCES transactions(id),
      fingerprint TEXT NOT NULL,
      date TEXT NOT NULL,
      wallet TEXT NOT NULL,
      type TEXT NOT NULL,
      category_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      note TEXT,
      labels TEXT,
      author TEXT,
      import_id INTEGER NOT NULL REFERENCES imports(id),
      source_file TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS duplicates_date_idx ON duplicates(date DESC);
    CREATE INDEX IF NOT EXISTS duplicates_fingerprint_idx ON duplicates(fingerprint);
  `);
  ensureColumn(db, "imports", "changed_rows", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "imports", "deletion_rows", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "imports", "full_import", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "transactions", "identity_key", "TEXT");
  ensureColumn(db, "transactions", "deleted_at", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS transactions_identity_idx ON transactions(identity_key);
    CREATE TABLE IF NOT EXISTS reconciliation_items (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL CHECK(action IN ('update', 'delete')),
      transaction_id INTEGER NOT NULL REFERENCES transactions(id),
      import_id INTEGER NOT NULL REFERENCES imports(id),
      proposed_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS reconciliation_status_idx ON reconciliation_items(status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_pending_unique
      ON reconciliation_items(transaction_id, action) WHERE status = 'pending';
    CREATE TABLE IF NOT EXISTS wallet_starting_balances (
      wallet TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (wallet, currency)
    );
    CREATE TABLE IF NOT EXISTS category_tag_config (
      category TEXT PRIMARY KEY,
      selected_tags_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS monthly_report_columns (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      budget REAL,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS split_records (
      id INTEGER PRIMARY KEY,
      split_count INTEGER NOT NULL CHECK(split_count > 0),
      total_amount REAL NOT NULL,
      split_amount REAL NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS split_entries (
      id INTEGER PRIMARY KEY,
      split_id INTEGER NOT NULL REFERENCES split_records(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('transaction', 'custom')),
      transaction_id INTEGER,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT,
      wallet TEXT,
      category_name TEXT,
      snapshot_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS split_entries_split_idx ON split_entries(split_id, id);
  `);
  ensureColumn(db, "category_tag_config", "enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "monthly_report_columns", "budget", "REAL");
  const missingKeys = db.prepare(
    "SELECT id, date, wallet, type FROM transactions WHERE identity_key IS NULL",
  ).all() as Array<{ id: number; date: string; wallet: string; type: string }>;
  const updateKey = db.prepare("UPDATE transactions SET identity_key = ? WHERE id = ?");
  db.transaction(() => {
    for (const row of missingKeys) {
      updateKey.run(identityKey(row), row.id);
    }
  })();
  return db;
}

export function getDatabase(): Db {
  singleton ??= openDatabase();
  return singleton;
}

export type WalletSummary = {
  wallet: string;
  transactionCount: number;
  currency: string;
  transactionTotal: number;
  startingAmount: number;
  total: number;
};

export function getWalletSummaries(db: Db): WalletSummary[] {
  return db.prepare(`
    SELECT t.wallet, COUNT(*) AS transactionCount, t.currency,
      COALESCE(SUM(t.amount), 0) AS transactionTotal,
      COALESCE(b.amount, 0) AS startingAmount,
      COALESCE(SUM(t.amount), 0) + COALESCE(b.amount, 0) AS total
    FROM transactions t
    LEFT JOIN wallet_starting_balances b ON b.wallet = t.wallet AND b.currency = t.currency
    WHERE t.deleted_at IS NULL
    GROUP BY t.wallet, t.currency, b.amount
    ORDER BY t.wallet COLLATE NOCASE, t.currency COLLATE NOCASE
  `).all() as WalletSummary[];
}

export function getWalletTransactions(db: Db, wallet: string, page: number, pageSize: number) {
  const total = (db.prepare(
    "SELECT COUNT(*) AS count FROM transactions WHERE wallet = ? AND deleted_at IS NULL",
  ).get(wallet) as { count: number }).count;
  const rows = db.prepare(`
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow,
      imported_at AS importedAt
    FROM transactions
    WHERE wallet = ? AND deleted_at IS NULL
    ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `).all(wallet, pageSize, (page - 1) * pageSize);
  const totals = db.prepare(`
    SELECT t.currency, COALESCE(SUM(t.amount), 0) AS transactionTotal,
      COALESCE(b.amount, 0) AS startingAmount,
      COALESCE(SUM(t.amount), 0) + COALESCE(b.amount, 0) AS total
    FROM transactions t
    LEFT JOIN wallet_starting_balances b ON b.wallet = t.wallet AND b.currency = t.currency
    WHERE t.wallet = ? AND t.deleted_at IS NULL
    GROUP BY t.currency, b.amount ORDER BY t.currency COLLATE NOCASE
  `).all(wallet) as Array<{
    currency: string;
    transactionTotal: number;
    startingAmount: number;
    total: number;
  }>;
  const dayRows = db.prepare(`
    SELECT date, amount, currency FROM transactions
    WHERE wallet = ? AND deleted_at IS NULL
  `).all(wallet) as Array<{ date: string; amount: number; currency: string }>;
  return {
    wallet,
    rows,
    totals,
    dayTotals: calculateDayTotals(dayRows),
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function setWalletStartingBalance(
  db: Db,
  wallet: string,
  currency: string,
  amount: number,
) {
  const exists = db.prepare(`
    SELECT 1 FROM transactions
    WHERE wallet = ? AND currency = ? AND deleted_at IS NULL LIMIT 1
  `).get(wallet, currency);
  if (!exists) throw new Error("Wallet currency not found.");
  db.prepare(`
    INSERT INTO wallet_starting_balances (wallet, currency, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(wallet, currency) DO UPDATE
    SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
  `).run(wallet, currency, amount);
  return { wallet, currency, startingAmount: amount };
}

export function getCategoryDetails(db: Db, category: string, page: number, pageSize: number) {
  const total = (db.prepare(`
    SELECT COUNT(*) AS count FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL
  `).get(category) as { count: number }).count;
  const rows = db.prepare(`
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow,
      imported_at AS importedAt
    FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL
    ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `).all(category, pageSize, (page - 1) * pageSize);
  const spendRows = db.prepare(`
    SELECT labels, amount, currency FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL
  `).all(category) as Array<{ labels: string | null; amount: number; currency: string }>;
  const dayRows = db.prepare(`
    SELECT date, amount, currency FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL
  `).all(category) as Array<{ date: string; amount: number; currency: string }>;
  const tagFrequency = new Map<string, number>();
  const parsedSpendRows = spendRows.map((row) => {
    const tags = row.labels
      ? Array.from(new Set(row.labels.split(",").map((tag) => tag.trim()).filter(Boolean)))
      : [];
    for (const tag of tags) tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
    return { ...row, tags };
  });
  const availableTags = Array.from(tagFrequency)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
  const savedConfig = db.prepare(
    "SELECT selected_tags_json AS selectedTagsJson, enabled FROM category_tag_config WHERE category = ?",
  ).get(category) as { selectedTagsJson: string; enabled: number } | undefined;
  const selectedTags = savedConfig
    ? (JSON.parse(savedConfig.selectedTagsJson) as string[]).filter((tag) => availableTags.includes(tag))
    : availableTags.slice(0, 6);
  const selectedSet = new Set(selectedTags);
  const segmentTotals = new Map<string, { tag: string; currency: string; amount: number; transactionCount: number }>();
  const spendingTotals = new Map<string, number>();
  for (const row of parsedSpendRows) {
    spendingTotals.set(row.currency, (spendingTotals.get(row.currency) ?? 0) + row.amount);
    const matched = row.tags.filter((tag) => selectedSet.has(tag));
    const destinations = matched.length ? matched : ["Other"];
    const allocatedSpend = row.amount / destinations.length;
    for (const tag of destinations) {
      const key = `${row.currency}\u0000${tag}`;
      const current = segmentTotals.get(key) ?? {
        tag,
        currency: row.currency,
        amount: 0,
        transactionCount: 0,
      };
      current.amount += allocatedSpend;
      current.transactionCount += 1;
      segmentTotals.set(key, current);
    }
  }
  const wallets = db.prepare(`
    SELECT wallet, COUNT(*) AS transactionCount
    FROM transactions WHERE category_name = ? AND deleted_at IS NULL
    GROUP BY wallet ORDER BY wallet COLLATE NOCASE
  `).all(category) as Array<{ wallet: string; transactionCount: number }>;
  return {
    category,
    rows,
    dayTotals: calculateDayTotals(dayRows),
    wallets,
    spendingTotals: Array.from(spendingTotals, ([currency, amount]) => ({ currency, amount })),
    availableTags,
    selectedTags,
    spendingByTagEnabled: savedConfig?.enabled !== 0,
    tagConfigSaved: Boolean(savedConfig),
    segments: Array.from(segmentTotals.values()).filter((segment) => Math.abs(segment.amount) > 0.000001).sort((a, b) =>
      a.currency.localeCompare(b.currency) || b.amount - a.amount || a.tag.localeCompare(b.tag)
    ),
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function resolveCategory(db: Db, identifier: string): string | null {
  let decoded = identifier;
  try {
    decoded = decodeURIComponent(identifier);
  } catch {
    // A malformed encoded value simply cannot match an exact category.
  }
  const categories = (db.prepare(`
    SELECT DISTINCT category_name AS category FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL
  `).all() as Array<{ category: string }>).map((row) => row.category);
  const exact = categories.find((category) => category === identifier || category === decoded);
  if (exact) return exact;
  return categories.find((category) => categorySlug(category) === identifier) ?? null;
}

export function setCategoryTags(
  db: Db,
  category: string,
  selectedTags: string[],
  enabled = true,
) {
  const exists = db.prepare(`
    SELECT 1 FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL LIMIT 1
  `).get(category);
  if (!exists) throw new Error("Category not found.");
  const normalizedTags = Array.from(new Set(
    selectedTags.map((tag) => tag.trim()).filter(Boolean),
  )).sort((a, b) => a.localeCompare(b));
  db.prepare(`
    INSERT INTO category_tag_config (category, selected_tags_json, enabled)
    VALUES (?, ?, ?)
    ON CONFLICT(category) DO UPDATE
    SET selected_tags_json = excluded.selected_tags_json, enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `).run(category, JSON.stringify(normalizedTags), enabled ? 1 : 0);
  return { category, selectedTags: normalizedTags, spendingByTagEnabled: enabled };
}

export type MonthlyReportColumn = {
  id?: number;
  name: string;
  categories: string[];
  budget?: number | null;
};

export function getMonthlyReport(db: Db) {
  const categories = (db.prepare(`
    SELECT DISTINCT category_name AS category
    FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL AND TRIM(category_name) <> ''
    ORDER BY category_name COLLATE NOCASE
  `).all() as Array<{ category: string }>).map((row) => row.category);
  const savedRows = db.prepare(`
    SELECT id, name, categories_json AS categoriesJson, budget
    FROM monthly_report_columns ORDER BY position, id
  `).all() as Array<{ id: number; name: string; categoriesJson: string; budget: number | null }>;
  const columns: MonthlyReportColumn[] = savedRows.length
    ? savedRows.map((row) => ({
        id: row.id,
        name: row.name,
        budget: row.budget,
        categories: (JSON.parse(row.categoriesJson) as string[]).filter((category) =>
          categories.includes(category),
        ),
      }))
    : categories.map((category) => ({ name: category, categories: [category], budget: null }));
  const transactions = db.prepare(`
    SELECT SUBSTR(date, 1, 7) AS month, category_name AS category,
      currency, SUM(amount) AS amount
    FROM transactions
    WHERE deleted_at IS NULL AND amount <> 0 AND category_name IS NOT NULL
    GROUP BY SUBSTR(date, 1, 7), category_name, currency
    ORDER BY month DESC
  `).all() as Array<{
    month: string;
    category: string;
    currency: string;
    amount: number;
  }>;
  const monthSet = new Set((db.prepare(`
    SELECT DISTINCT SUBSTR(date, 1, 7) AS month
    FROM transactions WHERE deleted_at IS NULL
    ORDER BY month DESC
  `).all() as Array<{ month: string }>).map((row) => row.month));
  const values = new Map<string, Map<string, number>>();
  for (const row of transactions) {
    monthSet.add(row.month);
    columns.forEach((column, index) => {
      if (!column.categories.includes(row.category)) return;
      const key = `${row.month}\u0000${index}`;
      const currencies = values.get(key) ?? new Map<string, number>();
      currencies.set(row.currency, (currencies.get(row.currency) ?? 0) + row.amount);
      values.set(key, currencies);
    });
  }
  const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a)).map((month) => ({
    month,
    cells: columns.map((_, index) =>
      Array.from(values.get(`${month}\u0000${index}`) ?? [], ([currency, amount]) => ({
        currency,
        amount,
      })).sort((a, b) => a.currency.localeCompare(b.currency)),
    ),
  }));
  return { categories, columns, months, configured: savedRows.length > 0 };
}

export function setMonthlyReportColumns(db: Db, columns: MonthlyReportColumn[]) {
  const available = new Set((db.prepare(`
    SELECT DISTINCT category_name AS category FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL AND TRIM(category_name) <> ''
  `).all() as Array<{ category: string }>).map((row) => row.category));
  const normalizedColumns = columns.map((column) => ({
    name: column.name.trim(),
    budget: column.budget == null ? null : Number(column.budget),
    categories: Array.from(new Set(column.categories.map((category) => category.trim())))
      .filter((category) => available.has(category)),
  }));
  if (!normalizedColumns.length) throw new Error("Add at least one column.");
  if (normalizedColumns.some((column) => !column.name)) {
    throw new Error("Every column needs a name.");
  }
  if (normalizedColumns.some((column) => !column.categories.length)) {
    throw new Error("Every column needs at least one category.");
  }
  if (normalizedColumns.some((column) =>
    column.budget !== null && (!Number.isFinite(column.budget) || column.budget <= 0)
  )) {
    throw new Error("Budgets must be positive numbers or left empty.");
  }
  db.transaction(() => {
    db.prepare("DELETE FROM monthly_report_columns").run();
    const insert = db.prepare(`
      INSERT INTO monthly_report_columns (name, categories_json, budget, position)
      VALUES (?, ?, ?, ?)
    `);
    normalizedColumns.forEach((column, position) => {
      insert.run(column.name, JSON.stringify(column.categories), column.budget, position);
    });
  })();
  return { columns: normalizedColumns };
}

export type TransactionFilters = {
  dateFrom?: string;
  dateTo?: string;
  wallets: string[];
  types: string[];
  categories: string[];
  tags: string[];
  authors: string[];
  amountOperator?: "gt" | "lt" | "eq";
  amount?: number;
};

function transactionFilterWhere(filters: TransactionFilters, activeOnly: boolean) {
  const clauses = activeOnly ? ["deleted_at IS NULL"] : [];
  const params: Array<string | number> = [];
  if (filters.dateFrom) {
    clauses.push("date >= ?");
    params.push(`${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    const exclusiveEnd = new Date(`${filters.dateTo}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    clauses.push("date < ?");
    params.push(exclusiveEnd.toISOString());
  }
  const addList = (column: string, values: string[]) => {
    if (!values.length) return;
    clauses.push(`${column} IN (${values.map(() => "?").join(", ")})`);
    params.push(...values);
  };
  addList("wallet", filters.wallets);
  addList("type", filters.types);
  addList("category_name", filters.categories);
  addList("author", filters.authors);
  if (filters.tags.length) {
    clauses.push(`(${filters.tags.map(() =>
      "(',' || LOWER(REPLACE(COALESCE(labels, ''), ', ', ',')) || ',') LIKE ? ESCAPE '\\'"
    ).join(" OR ")})`);
    params.push(...filters.tags.map((tag) =>
      `%,${tag.toLowerCase().replace(/[\\%_]/g, "\\$&")},%`
    ));
  }
  if (filters.amount !== undefined && Number.isFinite(filters.amount)) {
    if (filters.amountOperator === "gt") clauses.push("ABS(amount) > ?");
    if (filters.amountOperator === "lt") clauses.push("ABS(amount) < ?");
    if (filters.amountOperator === "eq") clauses.push("ABS(ABS(amount) - ?) < 0.005");
    if (filters.amountOperator) params.push(Math.abs(filters.amount));
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function getFilteredTransactionPage(
  db: Db,
  source: "transactions" | "duplicates",
  filters: TransactionFilters,
  page: number,
  pageSize: number,
) {
  const { sql, params } = transactionFilterWhere(filters, source === "transactions");
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM ${source} ${sql}`).get(
    ...params,
  ) as { count: number }).count;
  const duplicateField = source === "duplicates"
    ? "duplicate_of_id AS duplicateOfId,"
    : "";
  const rows = db.prepare(`
    SELECT id, ${duplicateField} date, wallet, type, category_name AS categoryName,
      amount, currency, note, labels, author, source_file AS sourceFile,
      source_row AS sourceRow, imported_at AS importedAt
    FROM ${source} ${sql}
    ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);
  const dayRows = db.prepare(`
    SELECT date, amount, currency FROM ${source} ${sql}
  `).all(...params) as Array<{ date: string; amount: number; currency: string }>;
  return {
    rows,
    dayTotals: calculateDayTotals(dayRows),
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function getTransactionFilterOptions(db: Db) {
  const distinct = (column: string) => (db.prepare(`
    SELECT DISTINCT ${column} AS value FROM transactions
    WHERE deleted_at IS NULL AND ${column} IS NOT NULL AND TRIM(${column}) <> ''
    ORDER BY ${column} COLLATE NOCASE
  `).all() as Array<{ value: string }>).map((row) => row.value);
  const tagSet = new Set<string>();
  const labelRows = db.prepare(`
    SELECT labels FROM transactions WHERE deleted_at IS NULL AND labels IS NOT NULL
  `).all() as Array<{ labels: string }>;
  for (const row of labelRows) {
    row.labels.split(",").map((tag) => tag.trim()).filter(Boolean).forEach((tag) => tagSet.add(tag));
  }
  return {
    wallets: distinct("wallet"),
    types: distinct("type"),
    categories: distinct("category_name"),
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    authors: distinct("author"),
  };
}

export type CustomSplitPosition = { description: string; amount: number };

export function createSplit(
  db: Db,
  transactionIds: number[],
  customPositions: CustomSplitPosition[],
  splitCount: number,
) {
  const ids = Array.from(new Set(transactionIds.filter(Number.isInteger)));
  if (!ids.length) throw new Error("Select at least one transaction.");
  if (!Number.isInteger(splitCount) || splitCount < 1) {
    throw new Error("Split count must be a positive whole number.");
  }
  const rows = db.prepare(`
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow
    FROM transactions WHERE id IN (${ids.map(() => "?").join(", ")})
  `).all(...ids) as Array<{
    id: number;
    date: string;
    wallet: string;
    type: string;
    categoryName: string | null;
    amount: number;
    currency: string;
    note: string | null;
    labels: string | null;
    author: string | null;
    sourceFile: string;
    sourceRow: number;
  }>;
  if (rows.length !== ids.length) throw new Error("One or more selected transactions no longer exist.");
  const currencies = new Set(rows.map((row) => row.currency));
  if (currencies.size !== 1) throw new Error("All selected transactions must use the same currency.");
  const positions = customPositions.map((position) => ({
    description: position.description.trim(),
    amount: Number(position.amount),
  }));
  if (positions.some((position) => !position.description || !Number.isFinite(position.amount))) {
    throw new Error("Every custom position needs a description and valid amount.");
  }
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0) +
    positions.reduce((sum, position) => sum + position.amount, 0);
  const splitAmount = totalAmount / splitCount;
  return db.transaction(() => {
    const record = db.prepare(`
      INSERT INTO split_records (split_count, total_amount, split_amount, currency)
      VALUES (?, ?, ?, ?)
    `).run(splitCount, totalAmount, splitAmount, rows[0].currency);
    const splitId = Number(record.lastInsertRowid);
    const insert = db.prepare(`
      INSERT INTO split_entries (
        split_id, kind, transaction_id, description, amount, date, wallet,
        category_name, snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
      insert.run(
        splitId, "transaction", row.id,
        row.note || row.categoryName || row.type,
        row.amount, row.date, row.wallet, row.categoryName, JSON.stringify(row),
      );
    }
    for (const position of positions) {
      insert.run(
        splitId, "custom", null, position.description, position.amount,
        null, null, null, JSON.stringify(position),
      );
    }
    return getSplit(db, splitId);
  })();
}

export function getSplit(db: Db, id: number) {
  const split = db.prepare(`
    SELECT id, split_count AS splitCount, total_amount AS totalAmount,
      split_amount AS splitAmount, currency, created_at AS createdAt
    FROM split_records WHERE id = ?
  `).get(id) as {
    id: number;
    splitCount: number;
    totalAmount: number;
    splitAmount: number;
    currency: string;
    createdAt: string;
  } | undefined;
  if (!split) return null;
  const entries = db.prepare(`
    SELECT id, kind, transaction_id AS transactionId, description, amount,
      date, wallet, category_name AS categoryName
    FROM split_entries WHERE split_id = ? ORDER BY id
  `).all(id);
  return { ...split, entries };
}

export function getSplits(db: Db) {
  return db.prepare(`
    SELECT s.id, s.split_count AS splitCount, s.total_amount AS totalAmount,
      s.split_amount AS splitAmount, s.currency, s.created_at AS createdAt,
      COUNT(e.id) AS entryCount,
      SUM(CASE WHEN e.kind = 'transaction' THEN 1 ELSE 0 END) AS transactionCount,
      SUM(CASE WHEN e.kind = 'custom' THEN 1 ELSE 0 END) AS customCount
    FROM split_records s
    LEFT JOIN split_entries e ON e.split_id = s.id
    GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC
  `).all();
}

export function deleteSplit(db: Db, id: number) {
  const result = db.prepare("DELETE FROM split_records WHERE id = ?").run(id);
  return result.changes > 0;
}

function normalized(value: string | null): string {
  return value?.trim().normalize("NFC") ?? "";
}

function ensureColumn(db: Db, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function identityKey(transaction: Pick<TransactionInput, "date" | "wallet" | "type">): string {
  const fields = [transaction.date, transaction.type, transaction.wallet].map((value) => normalized(value));
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export function fingerprint(transaction: TransactionInput): string {
  const fields = [
    transaction.date,
    transaction.wallet,
    transaction.type,
    transaction.categoryName,
    Number(transaction.amount).toString(),
    transaction.currency,
    transaction.note,
    transaction.labels,
    transaction.author,
  ].map((value) => normalized(value == null ? null : String(value)));
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export function importTransactions(
  db: Db,
  filename: string,
  rows: Array<{ transaction: TransactionInput; sourceRow: number; raw: unknown }>,
  options: { fullImport?: boolean } = {},
) {
  return db.transaction(() => {
    const wallets = new Set(rows.map((row) => normalized(row.transaction.wallet)));
    if (options.fullImport && wallets.size !== 1) {
      throw new Error(
        rows.length
          ? "Full import files must contain transactions from exactly one wallet."
          : "A header-only file cannot be used for a full import because its wallet is unknown.",
      );
    }
    const importResult = db
      .prepare("INSERT INTO imports (filename, total_rows, full_import) VALUES (?, ?, ?)")
      .run(filename, rows.length, options.fullImport ? 1 : 0);
    const importId = Number(importResult.lastInsertRowid);
    const find = db.prepare(`
      SELECT id, fingerprint, deleted_at AS deletedAt
      FROM transactions WHERE identity_key = ?
      ORDER BY (deleted_at IS NULL) DESC, id ASC LIMIT 1
    `);
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        fingerprint, identity_key, date, wallet, type, category_name, amount, currency, note,
        labels, author, import_id, source_file, source_row, raw_json
      ) VALUES (@fingerprint, @identityKey, @date, @wallet, @type, @categoryName, @amount, @currency,
        @note, @labels, @author, @importId, @sourceFile, @sourceRow, @rawJson)
    `);
    const insertDuplicate = db.prepare(`
      INSERT INTO duplicates (
        duplicate_of_id, fingerprint, date, wallet, type, category_name, amount,
        currency, note, labels, author, import_id, source_file, source_row, raw_json
      ) VALUES (@duplicateOfId, @fingerprint, @date, @wallet, @type, @categoryName,
        @amount, @currency, @note, @labels, @author, @importId, @sourceFile,
        @sourceRow, @rawJson)
    `);

    let imported = 0;
    let duplicates = 0;
    let changes = 0;
    let deletions = 0;
    const seenKeys = new Set<string>();
    for (const row of rows) {
      const hash = fingerprint(row.transaction);
      const key = identityKey(row.transaction);
      seenKeys.add(key);
      const existing = find.get(key) as { id: number; fingerprint: string; deletedAt: string | null } | undefined;
      const values = {
        ...row.transaction,
        fingerprint: hash,
        identityKey: key,
        importId,
        sourceFile: filename,
        sourceRow: row.sourceRow,
        rawJson: JSON.stringify(row.raw),
      };
      if (existing) {
        if (existing.fingerprint === hash && !existing.deletedAt) {
          supersedeReconciliation(db, existing.id, "update");
          supersedeReconciliation(db, existing.id, "delete");
          insertDuplicate.run({ ...values, duplicateOfId: existing.id });
          duplicates += 1;
        } else {
          supersedeReconciliation(db, existing.id, "delete");
          queueReconciliation(db, "update", existing.id, importId, JSON.stringify(values));
          changes += 1;
        }
      } else {
        insertTransaction.run(values);
        imported += 1;
      }
    }
    if (options.fullImport) {
      const wallet = rows[0].transaction.wallet;
      const active = db.prepare(
        "SELECT id, identity_key AS identityKey FROM transactions WHERE wallet = ? AND deleted_at IS NULL",
      ).all(wallet) as Array<{ id: number; identityKey: string }>;
      for (const transaction of active) {
        if (!seenKeys.has(transaction.identityKey)) {
          supersedeReconciliation(db, transaction.id, "update");
          queueReconciliation(db, "delete", transaction.id, importId, null);
          deletions += 1;
        }
      }
    }
    db.prepare(
      "UPDATE imports SET imported_rows = ?, duplicate_rows = ?, changed_rows = ?, deletion_rows = ? WHERE id = ?",
    ).run(imported, duplicates, changes, deletions, importId);
    return { importId, total: rows.length, imported, duplicates, changes, deletions };
  })();
}

function queueReconciliation(
  db: Db,
  action: "update" | "delete",
  transactionId: number,
  importId: number,
  proposedJson: string | null,
) {
  const pending = db.prepare(
    "SELECT id FROM reconciliation_items WHERE transaction_id = ? AND action = ? AND status = 'pending'",
  ).get(transactionId, action) as { id: number } | undefined;
  if (pending) {
    db.prepare(
      "UPDATE reconciliation_items SET import_id = ?, proposed_json = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(importId, proposedJson, pending.id);
  } else {
    db.prepare(
      "INSERT INTO reconciliation_items (action, transaction_id, import_id, proposed_json) VALUES (?, ?, ?, ?)",
    ).run(action, transactionId, importId, proposedJson);
  }
}

function supersedeReconciliation(db: Db, transactionId: number, action: "update" | "delete") {
  db.prepare(`
    UPDATE reconciliation_items
    SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP
    WHERE transaction_id = ? AND action = ? AND status = 'pending'
  `).run(transactionId, action);
}

export function reviewReconciliation(db: Db, ids: number[], decision: "approved" | "rejected") {
  return db.transaction(() => {
    const find = db.prepare(
      "SELECT id, action, transaction_id AS transactionId, proposed_json AS proposedJson FROM reconciliation_items WHERE id = ? AND status = 'pending'",
    );
    const updateTransaction = db.prepare(`
      UPDATE transactions SET fingerprint = @fingerprint, identity_key = @identityKey,
        date = @date, wallet = @wallet, type = @type, category_name = @categoryName,
        amount = @amount, currency = @currency, note = @note, labels = @labels,
        author = @author, import_id = @importId, source_file = @sourceFile,
        source_row = @sourceRow, raw_json = @rawJson, imported_at = CURRENT_TIMESTAMP,
        deleted_at = NULL WHERE id = @transactionId
    `);
    const softDelete = db.prepare(
      "UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    const finish = db.prepare(
      "UPDATE reconciliation_items SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    let reviewed = 0;
    for (const id of ids) {
      const item = find.get(id) as {
        id: number;
        action: "update" | "delete";
        transactionId: number;
        proposedJson: string | null;
      } | undefined;
      if (!item) continue;
      if (decision === "approved") {
        if (item.action === "update" && item.proposedJson) {
          updateTransaction.run({ ...JSON.parse(item.proposedJson), transactionId: item.transactionId });
        } else if (item.action === "delete") {
          softDelete.run(item.transactionId);
        }
      }
      finish.run(decision, item.id);
      reviewed += 1;
    }
    return { reviewed, decision };
  })();
}

export function resetDatabaseForTests() {
  singleton?.close();
  singleton = undefined;
}
