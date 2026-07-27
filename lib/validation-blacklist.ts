import type { Db } from "./db";
import type { ExtractedDocumentTransaction } from "./validation-types";

export function normalizeBlacklistedDescription(description: string) {
  return description.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function listValidationBlacklist(db: Db) {
  return db.prepare(`SELECT id, description, created_at AS createdAt
    FROM validation_description_blacklist ORDER BY description COLLATE NOCASE`).all() as Array<{
      id: number; description: string; createdAt: string;
    }>;
}

export function addValidationBlacklist(db: Db, description: string) {
  const clean = description.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Description is required.");
  db.prepare(`INSERT INTO validation_description_blacklist (description, normalized_description)
    VALUES (?, ?) ON CONFLICT(normalized_description) DO UPDATE SET description = excluded.description`)
    .run(clean, normalizeBlacklistedDescription(clean));
}

export function deleteValidationBlacklist(db: Db, id: number) {
  return db.prepare("DELETE FROM validation_description_blacklist WHERE id = ?").run(id).changes > 0;
}

export function filterBlacklistedTransactions(db: Db, transactions: ExtractedDocumentTransaction[]) {
  const blacklist = new Set((db.prepare("SELECT normalized_description FROM validation_description_blacklist").all() as Array<{ normalized_description: string }>)
    .map((row) => row.normalized_description));
  return transactions.filter((transaction) => !blacklist.has(normalizeBlacklistedDescription(transaction.description)));
}
