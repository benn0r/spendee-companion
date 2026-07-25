import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TransactionInput } from "./types";

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
  `);
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
