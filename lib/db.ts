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
  return db;
}

export function getDatabase(): Db {
  singleton ??= openDatabase();
  return singleton;
}

function normalized(value: string | null): string {
  return value?.trim().normalize("NFC") ?? "";
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
) {
  return db.transaction(() => {
    const importResult = db
      .prepare("INSERT INTO imports (filename, total_rows) VALUES (?, ?)")
      .run(filename, rows.length);
    const importId = Number(importResult.lastInsertRowid);
    const find = db.prepare("SELECT id FROM transactions WHERE fingerprint = ?");
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        fingerprint, date, wallet, type, category_name, amount, currency, note,
        labels, author, import_id, source_file, source_row, raw_json
      ) VALUES (@fingerprint, @date, @wallet, @type, @categoryName, @amount, @currency,
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
      const existing = find.get(hash) as { id: number } | undefined;
      const values = {
        ...row.transaction,
        fingerprint: hash,
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
    return { importId, total: rows.length, imported, duplicates };
  })();
}

export function resetDatabaseForTests() {
  singleton?.close();
  singleton = undefined;
}
