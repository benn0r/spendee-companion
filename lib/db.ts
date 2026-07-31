import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  TransactionInput,
  TransactionRow,
  TransactionValidation,
} from "./types";
import { calculateDayTotals } from "./day-groups";
import { categorySlug } from "./category-slug";
import { normalizeLocale, type AppLocale } from "./i18n";
import { filterBlacklistedTransactions } from "./validation-blacklist";
import { compareValidationTransactions } from "./validation-diff";
import type {
  ExtractedDocumentTransaction,
  ValidationAppTransaction,
} from "./validation-types";

export type Db = Database.Database;
let singleton: Db | undefined;

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function openDatabase(
  filename = process.env.SQLITE_PATH ?? "./data/spendee.db",
): Db {
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
  ensureColumn(db, "imports", "full_import", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "transactions", "identity_key", "TEXT");
  ensureColumn(db, "transactions", "deleted_at", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS transactions_identity_idx ON transactions(identity_key);
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
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS validation_runs (
      id INTEGER PRIMARY KEY,
      wallet TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      title TEXT NOT NULL,
      print_date TEXT,
      issuer TEXT,
      account_reference TEXT,
      metadata_json TEXT NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      thumbnail_png BLOB NOT NULL,
      extracted_json TEXT NOT NULL,
      raw_openai_json TEXT NOT NULL,
      diff_json TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS validation_runs_created_idx ON validation_runs(created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS validation_description_blacklist (
      id INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      normalized_description TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureColumn(
    db,
    "category_tag_config",
    "enabled",
    "INTEGER NOT NULL DEFAULT 1",
  );
  ensureColumn(db, "category_tag_config", "icon_id", "INTEGER");
  ensureColumn(db, "category_tag_config", "color", "TEXT");
  ensureColumn(db, "monthly_report_columns", "budget", "REAL");
  ensureColumn(db, "split_records", "title", "TEXT");
  ensureColumn(db, "split_records", "locale", "TEXT NOT NULL DEFAULT 'en'");
  ensureColumn(
    db,
    "validation_runs",
    "raw_openai_json",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  ensureColumn(
    db,
    "validation_runs",
    "status",
    "TEXT NOT NULL DEFAULT 'complete'",
  );
  ensureColumn(db, "validation_runs", "error", "TEXT");
  ensureColumn(db, "validation_runs", "pdf_blob", "BLOB");
  db.exec(`
    DROP TABLE IF EXISTS reconciliation_items;
    DELETE FROM duplicates
    WHERE duplicate_of_id IN (SELECT id FROM transactions WHERE deleted_at IS NOT NULL);
    DELETE FROM transactions WHERE deleted_at IS NOT NULL;
  `);
  const missingKeys = db
    .prepare(
      "SELECT id, date, wallet, type FROM transactions WHERE identity_key IS NULL",
    )
    .all() as Array<{ id: number; date: string; wallet: string; type: string }>;
  const updateKey = db.prepare(
    "UPDATE transactions SET identity_key = ? WHERE id = ?",
  );
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

export function getValidUntil(db: Db): string | null {
  const row = db
    .prepare(
      "SELECT value FROM app_settings WHERE key = 'transactions_valid_until'",
    )
    .get() as { value: string | null } | undefined;
  return row?.value || null;
}

export function setValidUntil(db: Db, value: string | null): string | null {
  const normalized = value?.trim() || null;
  if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Valid until must be a date.");
  }
  if (normalized) {
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.valueOf()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ) {
      throw new Error("Valid until must be a valid date.");
    }
  }
  db.prepare(
    `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('transactions_valid_until', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(normalized);
  return normalized;
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
  return db
    .prepare(
      `
    SELECT t.wallet, COUNT(*) AS transactionCount, t.currency,
      COALESCE(SUM(t.amount), 0) AS transactionTotal,
      COALESCE(b.amount, 0) AS startingAmount,
      COALESCE(SUM(t.amount), 0) + COALESCE(b.amount, 0) AS total
    FROM transactions t
    LEFT JOIN wallet_starting_balances b ON b.wallet = t.wallet AND b.currency = t.currency
    WHERE t.deleted_at IS NULL
    GROUP BY t.wallet, t.currency, b.amount
    ORDER BY t.wallet COLLATE NOCASE, t.currency COLLATE NOCASE
  `,
    )
    .all() as WalletSummary[];
}

export function getWalletTransactions(
  db: Db,
  wallet: string,
  page: number,
  pageSize: number,
) {
  const total = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM transactions WHERE wallet = ? AND deleted_at IS NULL",
      )
      .get(wallet) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow,
      imported_at AS importedAt
    FROM transactions
    WHERE wallet = ? AND deleted_at IS NULL
    ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `,
    )
    .all(wallet, pageSize, (page - 1) * pageSize);
  const totals = db
    .prepare(
      `
    SELECT t.currency, COALESCE(SUM(t.amount), 0) AS transactionTotal,
      COALESCE(b.amount, 0) AS startingAmount,
      COALESCE(SUM(t.amount), 0) + COALESCE(b.amount, 0) AS total
    FROM transactions t
    LEFT JOIN wallet_starting_balances b ON b.wallet = t.wallet AND b.currency = t.currency
    WHERE t.wallet = ? AND t.deleted_at IS NULL
    GROUP BY t.currency, b.amount ORDER BY t.currency COLLATE NOCASE
  `,
    )
    .all(wallet) as Array<{
    currency: string;
    transactionTotal: number;
    startingAmount: number;
    total: number;
  }>;
  const dayRows = db
    .prepare(
      `
    SELECT date, amount, currency FROM transactions
    WHERE wallet = ? AND deleted_at IS NULL
  `,
    )
    .all(wallet) as Array<{ date: string; amount: number; currency: string }>;
  return {
    wallet,
    rows,
    totals,
    validUntil: getValidUntil(db),
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
  const exists = db
    .prepare(
      `
    SELECT 1 FROM transactions
    WHERE wallet = ? AND currency = ? AND deleted_at IS NULL LIMIT 1
  `,
    )
    .get(wallet, currency);
  if (!exists) throw new Error("Wallet currency not found.");
  db.prepare(
    `
    INSERT INTO wallet_starting_balances (wallet, currency, amount)
    VALUES (?, ?, ?)
    ON CONFLICT(wallet, currency) DO UPDATE
    SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(wallet, currency, amount);
  return { wallet, currency, startingAmount: amount };
}

export function getCategoryDetails(
  db: Db,
  category: string,
  page: number,
  pageSize: number,
  filters?: TransactionFilters,
  chartMonth?: string | null,
) {
  const appliedFilters = filters ?? {
    wallets: [],
    types: [],
    categories: [],
    tags: [],
    authors: [],
  };
  const filtered = transactionFilterWhere(
    { ...appliedFilters, categories: [] },
    true,
  );
  const where = `${filtered.sql} AND category_name = ?`;
  const params = [...filtered.params, category];
  const total = (
    db
      .prepare(
        `
    SELECT COUNT(*) AS count FROM transactions
    ${where}
  `,
      )
      .get(...params) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow,
      imported_at AS importedAt
    FROM transactions
    ${where}
    ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  const spendRows = db
    .prepare(
      `
    SELECT date, labels, amount, currency FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL
  `,
    )
    .all(category) as Array<{
    date: string;
    labels: string | null;
    amount: number;
    currency: string;
  }>;
  const dayRows = db
    .prepare(
      `
    SELECT date, amount, currency FROM transactions
    ${where}
  `,
    )
    .all(...params) as Array<{
    date: string;
    amount: number;
    currency: string;
  }>;
  const tagFrequency = new Map<string, number>();
  const parsedAllSpendRows = spendRows.map((row) => {
    const tags = row.labels
      ? Array.from(
          new Set(
            row.labels
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        )
      : [];
    for (const tag of tags)
      tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
    return { ...row, tags };
  });
  const availableTags = Array.from(tagFrequency)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
  const savedConfig = db
    .prepare(
      "SELECT selected_tags_json AS selectedTagsJson, enabled, icon_id AS iconId, color FROM category_tag_config WHERE category = ?",
    )
    .get(category) as
    | {
        selectedTagsJson: string;
        enabled: number;
        iconId: number | null;
        color: string | null;
      }
    | undefined;
  const selectedTags = savedConfig
    ? (JSON.parse(savedConfig.selectedTagsJson) as string[]).filter((tag) =>
        availableTags.includes(tag),
      )
    : availableTags.slice(0, 6);
  const selectedSet = new Set(selectedTags);
  const currentMonth = currentMonthKey();
  const selectedChartMonth =
    chartMonth === undefined ? currentMonth : chartMonth;
  const parsedSpendRows =
    selectedChartMonth === null
      ? parsedAllSpendRows
      : parsedAllSpendRows.filter(
          (row) => row.date.slice(0, 7) === selectedChartMonth,
        );
  const segmentTotals = new Map<
    string,
    { tag: string; currency: string; amount: number; transactionCount: number }
  >();
  const spendingTotals = new Map<string, number>();
  const chartTotals = new Map<string, number>();
  for (const row of parsedAllSpendRows) {
    if (!spendingTotals.has(row.currency)) spendingTotals.set(row.currency, 0);
    if (row.date.slice(0, 7) === currentMonth) {
      spendingTotals.set(
        row.currency,
        (spendingTotals.get(row.currency) ?? 0) + row.amount,
      );
    }
  }
  for (const row of parsedSpendRows) {
    chartTotals.set(
      row.currency,
      (chartTotals.get(row.currency) ?? 0) + row.amount,
    );
    const matched = row.tags.filter((tag) => selectedSet.has(tag));
    const destinations = matched.length ? matched : ["Other"];
    // A transaction may carry several selected labels. Split it evenly so the
    // chart remains exhaustive without counting the transaction more than once.
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
  const wallets = db
    .prepare(
      `
    SELECT wallet, COUNT(*) AS transactionCount
    FROM transactions WHERE category_name = ? AND deleted_at IS NULL
    GROUP BY wallet ORDER BY wallet COLLATE NOCASE
  `,
    )
    .all(category) as Array<{ wallet: string; transactionCount: number }>;
  return {
    category,
    rows,
    validUntil: getValidUntil(db),
    dayTotals: calculateDayTotals(dayRows),
    wallets,
    spendingTotals: Array.from(spendingTotals, ([currency, amount]) => ({
      currency,
      amount,
    })),
    chartTotals: Array.from(chartTotals, ([currency, amount]) => ({
      currency,
      amount,
    })),
    currentMonth,
    chartMonth: selectedChartMonth,
    availableMonths: Array.from(
      new Set([currentMonth, ...spendRows.map((row) => row.date.slice(0, 7))]),
    )
      .sort()
      .reverse(),
    availableTags,
    selectedTags,
    spendingByTagEnabled: savedConfig?.enabled !== 0,
    appearance: {
      iconId: savedConfig?.iconId ?? null,
      color: savedConfig?.color ?? "#1eadcf",
    },
    tagConfigSaved: Boolean(savedConfig),
    segments: Array.from(segmentTotals.values())
      .filter((segment) => Math.abs(segment.amount) > 0.000001)
      .sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) ||
          b.amount - a.amount ||
          a.tag.localeCompare(b.tag),
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
  const categories = (
    db
      .prepare(
        `
    SELECT DISTINCT category_name AS category FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL
  `,
      )
      .all() as Array<{ category: string }>
  ).map((row) => row.category);
  const exact = categories.find(
    (category) => category === identifier || category === decoded,
  );
  if (exact) return exact;
  return (
    categories.find((category) => categorySlug(category) === identifier) ?? null
  );
}

export function setCategoryTags(
  db: Db,
  category: string,
  selectedTags: string[],
  enabled = true,
  iconId: number | null = null,
  color = "#1eadcf",
) {
  const exists = db
    .prepare(
      `
    SELECT 1 FROM transactions
    WHERE category_name = ? AND deleted_at IS NULL LIMIT 1
  `,
    )
    .get(category);
  if (!exists) throw new Error("Category not found.");
  const normalizedTags = Array.from(
    new Set(selectedTags.map((tag) => tag.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  db.prepare(
    `
    INSERT INTO category_tag_config (category, selected_tags_json, enabled, icon_id, color)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(category) DO UPDATE
    SET selected_tags_json = excluded.selected_tags_json, enabled = excluded.enabled,
      icon_id = excluded.icon_id, color = excluded.color,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run(
    category,
    JSON.stringify(normalizedTags),
    enabled ? 1 : 0,
    iconId,
    color,
  );
  return {
    category,
    selectedTags: normalizedTags,
    spendingByTagEnabled: enabled,
    appearance: { iconId, color },
  };
}

export type MonthlyReportColumn = {
  id?: number;
  name: string;
  categories: string[];
  budget?: number | null;
};

export function getMonthlyReport(db: Db) {
  const categories = (
    db
      .prepare(
        `
    SELECT DISTINCT category_name AS category
    FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL AND TRIM(category_name) <> ''
    ORDER BY category_name COLLATE NOCASE
  `,
      )
      .all() as Array<{ category: string }>
  ).map((row) => row.category);
  const savedRows = db
    .prepare(
      `
    SELECT id, name, categories_json AS categoriesJson, budget
    FROM monthly_report_columns ORDER BY position, id
  `,
    )
    .all() as Array<{
    id: number;
    name: string;
    categoriesJson: string;
    budget: number | null;
  }>;
  const columns: MonthlyReportColumn[] = savedRows.length
    ? savedRows.map((row) => ({
        id: row.id,
        name: row.name,
        budget: row.budget,
        categories: (JSON.parse(row.categoriesJson) as string[]).filter(
          (category) => categories.includes(category),
        ),
      }))
    : categories.map((category) => ({
        name: category,
        categories: [category],
        budget: null,
      }));
  const transactions = db
    .prepare(
      `
    SELECT SUBSTR(date, 1, 7) AS month, category_name AS category,
      currency, SUM(amount) AS amount
    FROM transactions
    WHERE deleted_at IS NULL AND amount <> 0 AND category_name IS NOT NULL
    GROUP BY SUBSTR(date, 1, 7), category_name, currency
    ORDER BY month DESC
  `,
    )
    .all() as Array<{
    month: string;
    category: string;
    currency: string;
    amount: number;
  }>;
  const monthSet = new Set(
    (
      db
        .prepare(
          `
    SELECT DISTINCT SUBSTR(date, 1, 7) AS month
    FROM transactions WHERE deleted_at IS NULL
    ORDER BY month DESC
  `,
        )
        .all() as Array<{ month: string }>
    ).map((row) => row.month),
  );
  const values = new Map<string, Map<string, number>>();
  for (const row of transactions) {
    monthSet.add(row.month);
    columns.forEach((column, index) => {
      if (!column.categories.includes(row.category)) return;
      const key = `${row.month}\u0000${index}`;
      const currencies = values.get(key) ?? new Map<string, number>();
      currencies.set(
        row.currency,
        (currencies.get(row.currency) ?? 0) + row.amount,
      );
      values.set(key, currencies);
    });
  }
  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .map((month) => ({
      month,
      cells: columns.map((_, index) =>
        Array.from(
          values.get(`${month}\u0000${index}`) ?? [],
          ([currency, amount]) => ({
            currency,
            amount,
          }),
        ).sort((a, b) => a.currency.localeCompare(b.currency)),
      ),
    }));
  const yearValues = new Map<string, Map<number, Map<string, number>>>();
  for (const month of months) {
    const year = month.month.slice(0, 4);
    const columnsByIndex = yearValues.get(year) ?? new Map();
    month.cells.forEach((cell, index) => {
      const currencies = columnsByIndex.get(index) ?? new Map();
      for (const value of cell) {
        currencies.set(
          value.currency,
          (currencies.get(value.currency) ?? 0) + value.amount,
        );
      }
      columnsByIndex.set(index, currencies);
    });
    yearValues.set(year, columnsByIndex);
  }
  const years = Array.from(yearValues, ([year, columnsByIndex]) => ({
    year,
    cells: columns.map((_, index) =>
      Array.from(columnsByIndex.get(index) ?? [], ([currency, amount]) => ({
        currency,
        amount,
      })).sort((a, b) => a.currency.localeCompare(b.currency)),
    ),
  })).sort((a, b) => b.year.localeCompare(a.year));
  return {
    categories,
    columns,
    months,
    years,
    configured: savedRows.length > 0,
  };
}

export function setMonthlyReportColumns(
  db: Db,
  columns: MonthlyReportColumn[],
) {
  const available = new Set(
    (
      db
        .prepare(
          `
    SELECT DISTINCT category_name AS category FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL AND TRIM(category_name) <> ''
  `,
        )
        .all() as Array<{ category: string }>
    ).map((row) => row.category),
  );
  const normalizedColumns = columns.map((column) => ({
    name: column.name.trim(),
    budget: column.budget == null ? null : Number(column.budget),
    categories: Array.from(
      new Set(column.categories.map((category) => category.trim())),
    ).filter((category) => available.has(category)),
  }));
  if (!normalizedColumns.length) throw new Error("Add at least one column.");
  if (normalizedColumns.some((column) => !column.name)) {
    throw new Error("Every column needs a name.");
  }
  if (normalizedColumns.some((column) => !column.categories.length)) {
    throw new Error("Every column needs at least one category.");
  }
  if (
    normalizedColumns.some(
      (column) =>
        column.budget !== null &&
        (!Number.isFinite(column.budget) || column.budget <= 0),
    )
  ) {
    throw new Error("Budgets must be positive numbers or left empty.");
  }
  db.transaction(() => {
    db.prepare("DELETE FROM monthly_report_columns").run();
    const insert = db.prepare(`
      INSERT INTO monthly_report_columns (name, categories_json, budget, position)
      VALUES (?, ?, ?, ?)
    `);
    normalizedColumns.forEach((column, position) => {
      insert.run(
        column.name,
        JSON.stringify(column.categories),
        column.budget,
        position,
      );
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

function transactionFilterWhere(
  filters: TransactionFilters,
  activeOnly: boolean,
) {
  const clauses = activeOnly ? ["deleted_at IS NULL"] : [];
  // Append placeholders and values together: every caller reuses this exact pair
  // for count, page, and day-total queries, so their filter semantics stay aligned.
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
    // Labels are stored as comma-separated text. Padding both sides with commas
    // gives exact, case-insensitive label matches instead of substring matches.
    clauses.push(
      `(${filters.tags
        .map(
          () =>
            "(',' || LOWER(REPLACE(COALESCE(labels, ''), ', ', ',')) || ',') LIKE ? ESCAPE '\\'",
        )
        .join(" OR ")})`,
    );
    params.push(
      ...filters.tags.map(
        (tag) => `%,${tag.toLowerCase().replace(/[\\%_]/g, "\\$&")},%`,
      ),
    );
  }
  if (filters.amount !== undefined && Number.isFinite(filters.amount)) {
    if (filters.amountOperator === "gt") clauses.push("ABS(amount) > ?");
    if (filters.amountOperator === "lt") clauses.push("ABS(amount) < ?");
    // Imported amounts are floating-point values; half a cent is the boundary
    // for considering their absolute monetary values equal.
    if (filters.amountOperator === "eq")
      clauses.push("ABS(ABS(amount) - ?) < 0.005");
    if (filters.amountOperator) params.push(Math.abs(filters.amount));
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function getFilteredTransactionPage(
  db: Db,
  source: "transactions" | "duplicates",
  filters: TransactionFilters,
  page: number,
  pageSize: number,
) {
  const { sql, params } = transactionFilterWhere(
    filters,
    source === "transactions",
  );
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM ${source} ${sql}`)
      .get(...params) as { count: number }
  ).count;
  const duplicateField =
    source === "duplicates" ? "duplicate_of_id AS duplicateOfId," : "";
  const rows = db
    .prepare(
      `
    SELECT id, ${duplicateField} date, wallet, type, category_name AS categoryName,
      amount, currency, note, labels, author, source_file AS sourceFile,
      source_row AS sourceRow, imported_at AS importedAt
    FROM ${source} ${sql}
    ORDER BY date DESC, id DESC LIMIT ? OFFSET ?
  `,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Array<
    Omit<TransactionRow, "validation"> & { duplicateOfId?: number }
  >;
  const dayRows = db
    .prepare(
      `
    SELECT date, amount, currency FROM ${source} ${sql}
  `,
    )
    .all(...params) as Array<{
    date: string;
    amount: number;
    currency: string;
  }>;
  return {
    rows: attachValidationReferences(db, source, rows),
    dayTotals: calculateDayTotals(dayRows),
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

type LiveValidation = Pick<TransactionValidation, "id" | "title"> & {
  wallet: string;
  dateFrom: string;
  dateTo: string;
  extractedJson: string;
};

function parsedValidationTransactions(
  value: string,
): ExtractedDocumentTransaction[] | null {
  try {
    const document = JSON.parse(value) as { transactions?: unknown };
    if (!Array.isArray(document.transactions)) return null;
    if (
      !document.transactions.every(
        (transaction): transaction is ExtractedDocumentTransaction => {
          if (!transaction || typeof transaction !== "object") return false;
          const candidate =
            transaction as Partial<ExtractedDocumentTransaction>;
          return (
            typeof candidate.date === "string" &&
            typeof candidate.description === "string" &&
            typeof candidate.amount === "number" &&
            Number.isFinite(candidate.amount) &&
            typeof candidate.currency === "string"
          );
        },
      )
    )
      return null;
    return document.transactions;
  } catch {
    // A malformed historical extraction must not break the transaction list.
    return null;
  }
}

function liveValidationTransactions(
  db: Db,
  wallet: string,
  dateFrom: string,
  dateTo: string,
) {
  const inclusiveStart = new Date(`${dateFrom}T00:00:00.000Z`);
  const exclusiveEnd = new Date(`${dateTo}T00:00:00.000Z`);
  if (
    !Number.isFinite(inclusiveStart.valueOf()) ||
    !Number.isFinite(exclusiveEnd.valueOf())
  )
    return [];
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return db
    .prepare(
      `
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency, note
    FROM transactions
    WHERE deleted_at IS NULL AND wallet = ?
      AND LOWER(type) NOT IN ('transfer', 'incoming transfer', 'outgoing transfer')
      AND date >= ? AND date < ?
    ORDER BY date ASC, id ASC
  `,
    )
    .all(
      wallet,
      inclusiveStart.toISOString(),
      exclusiveEnd.toISOString(),
    ) as ValidationAppTransaction[];
}

function attachValidationReferences(
  db: Db,
  source: "transactions" | "duplicates",
  rows: Array<Omit<TransactionRow, "validation"> & { duplicateOfId?: number }>,
) {
  const withoutMatches = rows.map((row) => ({ ...row, validation: null }));
  if (source !== "transactions" || !rows.length) return withoutMatches;

  const wallets = Array.from(new Set(rows.map((row) => row.wallet)));
  const dates = rows.map((row) => row.date.slice(0, 10)).sort();
  const validations = db
    .prepare(
      `
    SELECT id, title, wallet, date_from AS dateFrom, date_to AS dateTo,
      extracted_json AS extractedJson
    FROM validation_runs
    WHERE status = 'complete'
      AND wallet IN (${wallets.map(() => "?").join(", ")})
      AND date_from <= ? AND date_to >= ?
    ORDER BY created_at DESC, id DESC
  `,
    )
    .all(...wallets, dates[dates.length - 1], dates[0]) as LiveValidation[];

  const pageIds = new Set(rows.map((row) => row.id));
  const references = new Map<number, TransactionValidation>();
  const rangeTransactions = new Map<string, ValidationAppTransaction[]>();
  // Re-run reconciliation against current wallet rows rather than trusting the
  // transaction IDs captured in diff_json. Full imports replace those rows, so
  // IDs are intentionally transient while statement posting fields stay stable.
  for (const validation of validations) {
    const extractedTransactions = parsedValidationTransactions(
      validation.extractedJson,
    );
    if (!extractedTransactions) continue;
    const documentTransactions = filterBlacklistedTransactions(
      db,
      extractedTransactions,
    );
    const rangeKey = JSON.stringify([
      validation.wallet,
      validation.dateFrom,
      validation.dateTo,
    ]);
    let appTransactions = rangeTransactions.get(rangeKey);
    if (!appTransactions) {
      appTransactions = liveValidationTransactions(
        db,
        validation.wallet,
        validation.dateFrom,
        validation.dateTo,
      );
      rangeTransactions.set(rangeKey, appTransactions);
    }
    const diff = compareValidationTransactions(
      documentTransactions,
      appTransactions,
    );
    for (const match of diff.matching) {
      if (!pageIds.has(match.app.id) || references.has(match.app.id)) continue;
      references.set(match.app.id, {
        id: validation.id,
        title: validation.title,
        description: match.document.description,
      });
    }
  }

  return rows.map((row) => ({
    ...row,
    validation: references.get(row.id) ?? null,
  }));
}

export function getTransactionFilterOptions(db: Db) {
  const distinct = (column: string) =>
    (
      db
        .prepare(
          `
    SELECT DISTINCT ${column} AS value FROM transactions
    WHERE deleted_at IS NULL AND ${column} IS NOT NULL AND TRIM(${column}) <> ''
    ORDER BY ${column} COLLATE NOCASE
  `,
        )
        .all() as Array<{ value: string }>
    ).map((row) => row.value);
  const tagSet = new Set<string>();
  const labelRows = db
    .prepare(
      `
    SELECT labels FROM transactions WHERE deleted_at IS NULL AND labels IS NOT NULL
  `,
    )
    .all() as Array<{ labels: string }>;
  for (const row of labelRows) {
    row.labels
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .forEach((tag) => tagSet.add(tag));
  }
  const currentMonth = currentMonthKey();
  const categoryMonthlyTotals = new Map<
    string,
    Array<{ currency: string; amount: number }>
  >();
  const monthlyRows = db
    .prepare(
      `
    SELECT category_name AS category, currency,
      SUM(CASE WHEN SUBSTR(date, 1, 7) = ? THEN amount ELSE 0 END) AS amount
    FROM transactions
    WHERE deleted_at IS NULL AND category_name IS NOT NULL
    GROUP BY category_name, currency
    ORDER BY category_name COLLATE NOCASE, currency COLLATE NOCASE
  `,
    )
    .all(currentMonth) as Array<{
    category: string;
    currency: string;
    amount: number;
  }>;
  for (const row of monthlyRows) {
    const totals = categoryMonthlyTotals.get(row.category) ?? [];
    totals.push({ currency: row.currency, amount: row.amount });
    categoryMonthlyTotals.set(row.category, totals);
  }
  return {
    wallets: distinct("wallet"),
    types: distinct("type"),
    categories: distinct("category_name"),
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    authors: distinct("author"),
    categoryAppearances: Object.fromEntries(
      (
        db
          .prepare(
            `
      SELECT category, icon_id AS iconId, COALESCE(color, '#1eadcf') AS color
      FROM category_tag_config
    `,
          )
          .all() as Array<{
          category: string;
          iconId: number | null;
          color: string;
        }>
      ).map((row) => [row.category, { iconId: row.iconId, color: row.color }]),
    ),
    categoryMonthlyTotals: Object.fromEntries(categoryMonthlyTotals),
    currentMonth,
  };
}

export function deleteDuplicates(db: Db, ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Number.isInteger)));
  if (!uniqueIds.length) throw new Error("Select at least one duplicate.");
  const result = db
    .prepare(
      `DELETE FROM duplicates WHERE id IN (${uniqueIds.map(() => "?").join(", ")})`,
    )
    .run(...uniqueIds);
  return result.changes;
}

export type CustomSplitPosition = { description: string; amount: number };

export function createSplit(
  db: Db,
  title: string,
  transactionIds: number[],
  customPositions: CustomSplitPosition[],
  splitCount: number,
  requestedLocale: AppLocale = "en",
) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("Enter a title for the split.");
  if (normalizedTitle.length > 120)
    throw new Error("Split title must be 120 characters or fewer.");
  const ids = Array.from(new Set(transactionIds.filter(Number.isInteger)));
  if (!ids.length) throw new Error("Select at least one transaction.");
  if (!Number.isInteger(splitCount) || splitCount < 1) {
    throw new Error("Split count must be a positive whole number.");
  }
  const rows = db
    .prepare(
      `
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency,
      note, labels, author, source_file AS sourceFile, source_row AS sourceRow
    FROM transactions WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(", ")})
  `,
    )
    .all(...ids) as Array<{
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
  if (rows.length !== ids.length)
    throw new Error("One or more selected transactions no longer exist.");
  const currencies = new Set(rows.map((row) => row.currency));
  if (currencies.size !== 1)
    throw new Error("All selected transactions must use the same currency.");
  const positions = customPositions.map((position) => ({
    description: position.description.trim(),
    amount: Number(position.amount),
  }));
  if (
    positions.some(
      (position) => !position.description || !Number.isFinite(position.amount),
    )
  ) {
    throw new Error(
      "Every custom position needs a description and valid amount.",
    );
  }
  // Aggregate transaction and custom positions before dividing. Rounding each
  // position first would accumulate currency rounding drift across the split.
  const totalAmount =
    rows.reduce((sum, row) => sum + row.amount, 0) +
    positions.reduce((sum, position) => sum + position.amount, 0);
  const splitAmount = totalAmount / splitCount;
  const locale = normalizeLocale(requestedLocale);
  return db.transaction(() => {
    const record = db
      .prepare(
        `
      INSERT INTO split_records (title, split_count, total_amount, split_amount, currency, locale)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        normalizedTitle,
        splitCount,
        totalAmount,
        splitAmount,
        rows[0].currency,
        locale,
      );
    const splitId = Number(record.lastInsertRowid);
    const insert = db.prepare(`
      INSERT INTO split_entries (
        split_id, kind, transaction_id, description, amount, date, wallet,
        category_name, snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of rows.sort(
      (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
    )) {
      // Keep an immutable snapshot: later imports can replace the source row,
      // but an already-created split must continue to render the original data.
      insert.run(
        splitId,
        "transaction",
        row.id,
        row.note || row.categoryName || row.type,
        row.amount,
        row.date,
        row.wallet,
        row.categoryName,
        JSON.stringify(row),
      );
    }
    for (const position of positions) {
      insert.run(
        splitId,
        "custom",
        null,
        position.description,
        position.amount,
        null,
        null,
        null,
        JSON.stringify(position),
      );
    }
    return getSplit(db, splitId);
  })();
}

export function getSplit(db: Db, id: number) {
  const split = db
    .prepare(
      `
    SELECT id, COALESCE(NULLIF(TRIM(title), ''), 'Split #' || id) AS title,
      split_count AS splitCount, total_amount AS totalAmount,
      split_amount AS splitAmount, currency, locale, created_at AS createdAt
    FROM split_records WHERE id = ?
  `,
    )
    .get(id) as
    | {
        id: number;
        title: string;
        splitCount: number;
        totalAmount: number;
        splitAmount: number;
        currency: string;
        locale: AppLocale;
        createdAt: string;
      }
    | undefined;
  if (!split) return null;
  const entries = db
    .prepare(
      `
    SELECT id, kind, transaction_id AS transactionId, description, amount,
      date, wallet, category_name AS categoryName
    FROM split_entries WHERE split_id = ? ORDER BY id
  `,
    )
    .all(id);
  return { ...split, entries };
}

export function getSplits(db: Db) {
  return db
    .prepare(
      `
    SELECT s.id, COALESCE(NULLIF(TRIM(s.title), ''), 'Split #' || s.id) AS title,
      s.split_count AS splitCount, s.total_amount AS totalAmount,
      s.split_amount AS splitAmount, s.currency, s.locale, s.created_at AS createdAt,
      COUNT(e.id) AS entryCount,
      SUM(CASE WHEN e.kind = 'transaction' THEN 1 ELSE 0 END) AS transactionCount,
      SUM(CASE WHEN e.kind = 'custom' THEN 1 ELSE 0 END) AS customCount
    FROM split_records s
    LEFT JOIN split_entries e ON e.split_id = s.id
    GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC
  `,
    )
    .all();
}

export function deleteSplit(db: Db, id: number) {
  const result = db.prepare("DELETE FROM split_records WHERE id = ?").run(id);
  return result.changes > 0;
}

function normalized(value: string | null): string {
  return value?.trim().normalize("NFC") ?? "";
}

function ensureColumn(
  db: Db,
  table: string,
  column: string,
  definition: string,
) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function identityKey(
  transaction: Pick<TransactionInput, "date" | "wallet" | "type">,
): string {
  const fields = [transaction.date, transaction.type, transaction.wallet].map(
    (value) => normalized(value),
  );
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
  rows: Array<{
    transaction: TransactionInput;
    sourceRow: number;
    raw: unknown;
  }>,
  options: { fullImport?: boolean } = {},
) {
  return db.transaction(() => {
    const wallets = new Set(
      rows.map((row) => normalized(row.transaction.wallet)),
    );
    if (options.fullImport && wallets.size !== 1) {
      throw new Error(
        rows.length
          ? "Full import files must contain transactions from exactly one wallet."
          : "A header-only file cannot be used for a full import because its wallet is unknown.",
      );
    }
    const importResult = db
      .prepare(
        "INSERT INTO imports (filename, total_rows, full_import) VALUES (?, ?, ?)",
      )
      .run(filename, rows.length, options.fullImport ? 1 : 0);
    const importId = Number(importResult.lastInsertRowid);
    const wallet = options.fullImport ? rows[0].transaction.wallet : null;
    const replaced = wallet
      ? (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM transactions WHERE wallet = ?",
            )
            .get(wallet) as { count: number }
        ).count
      : 0;
    if (wallet) {
      // Full import is a replacement, not a merge. These deletes and all inserts
      // share this outer transaction, so a failed replacement rolls back intact.
      db.prepare(
        `
        DELETE FROM duplicates
        WHERE wallet = ? OR duplicate_of_id IN (SELECT id FROM transactions WHERE wallet = ?)
      `,
      ).run(wallet, wallet);
      db.prepare("DELETE FROM transactions WHERE wallet = ?").run(wallet);
    }
    const find = db.prepare(
      "SELECT id FROM transactions WHERE fingerprint = ? LIMIT 1",
    );
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
    for (const row of rows) {
      const hash = fingerprint(row.transaction);
      const key = identityKey(row.transaction);
      const existing = find.get(hash) as { id: number } | undefined;
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
        insertDuplicate.run({ ...values, duplicateOfId: existing.id });
        duplicates += 1;
      } else {
        insertTransaction.run(values);
        imported += 1;
      }
    }
    db.prepare(
      "UPDATE imports SET imported_rows = ?, duplicate_rows = ? WHERE id = ?",
    ).run(imported, duplicates, importId);
    return { importId, total: rows.length, imported, duplicates, replaced };
  })();
}

export function resetDatabaseForTests() {
  singleton?.close();
  singleton = undefined;
}
