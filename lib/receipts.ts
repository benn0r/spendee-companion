import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./db";
import type {
  ReceiptApiRecord,
  ReceiptRecord,
  ReceiptStatus,
  ReceiptSuggestion,
} from "./receipt-types";

type ReceiptRow = {
  id: number;
  filename: string;
  mime_type: string;
  file_path: string;
  account_id: string;
  account_name: string;
  status: ReceiptStatus;
  suggestion_json: string | null;
  error: string | null;
  submitted: number;
  actual_transaction_id: string | null;
  created_at: string;
  processed_at: string | null;
  submitted_at: string | null;
};

const receiptTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);

function receiptDirectory() {
  return process.env.RECEIPTS_DIR?.trim() || "/data/receipts";
}

function fromRow(row: ReceiptRow): ReceiptRecord {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    filePath: row.file_path,
    accountId: row.account_id,
    accountName: row.account_name,
    status: row.status,
    suggestion: row.suggestion_json
      ? (JSON.parse(row.suggestion_json) as ReceiptSuggestion)
      : null,
    error: row.error,
    submitted: Boolean(row.submitted),
    actualTransactionId: row.actual_transaction_id,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    submittedAt: row.submitted_at,
  };
}

export function toReceiptApiRecord(receipt: ReceiptRecord): ReceiptApiRecord {
  const record = { ...receipt } as Partial<ReceiptRecord>;
  delete record.filePath;
  return record as ReceiptApiRecord;
}

export function listReceipts(db: Db, limit = 100): ReceiptRecord[] {
  return (
    db
      .prepare("SELECT * FROM receipts ORDER BY id DESC LIMIT ?")
      .all(limit) as ReceiptRow[]
  ).map(fromRow);
}

export function getReceipt(db: Db, id: number): ReceiptRecord | undefined {
  const row = db.prepare("SELECT * FROM receipts WHERE id = ?").get(id) as
    ReceiptRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function nextQueuedReceipt(db: Db): ReceiptRecord | undefined {
  const row = db
    .prepare(
      "SELECT id FROM receipts WHERE status = 'queued' ORDER BY id LIMIT 1",
    )
    .get() as { id: number } | undefined;
  if (!row) return undefined;
  const updated = db
    .prepare(
      "UPDATE receipts SET status = 'processing', error = NULL WHERE id = ? AND status = 'queued'",
    )
    .run(row.id);
  return updated.changes ? getReceipt(db, row.id) : undefined;
}

export async function saveReceipt(
  db: Db,
  input: {
    filename: string;
    mimeType: string;
    data: Buffer;
    accountId: string;
    accountName: string;
  },
): Promise<number> {
  const extension = receiptTypes.get(input.mimeType);
  if (!extension) throw new Error("Unsupported receipt type.");
  if (!input.data.length || input.data.length > 10 * 1024 * 1024) {
    throw new Error("Receipt files must be between 1 byte and 10 MB.");
  }
  const directory = receiptDirectory();
  await mkdir(directory, { recursive: true });
  const filePath = join(
    /* turbopackIgnore: true */ directory,
    `${randomUUID()}${extension}`,
  );
  await writeFile(filePath, input.data, { flag: "wx", mode: 0o600 });
  try {
    const result = db
      .prepare(
        `INSERT INTO receipts
          (filename, mime_type, file_path, account_id, account_name)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.filename.trim().slice(0, 255) || `receipt${extension}`,
        input.mimeType,
        filePath,
        input.accountId,
        input.accountName,
      );
    return Number(result.lastInsertRowid);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
}

export async function readReceiptFile(receipt: ReceiptRecord) {
  return readFile(receipt.filePath);
}

export function completeReceipt(
  db: Db,
  id: number,
  suggestion: ReceiptSuggestion,
): void {
  db.prepare(
    `UPDATE receipts SET status = 'processed', suggestion_json = ?, error = NULL,
      processed_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(JSON.stringify(suggestion), id);
}

export function failReceipt(db: Db, id: number, error: string): void {
  db.prepare(
    "UPDATE receipts SET status = 'failed', error = ? WHERE id = ?",
  ).run(error.slice(0, 1_000), id);
}

export function markReceiptSubmitted(
  db: Db,
  id: number,
  transactionId: string,
): void {
  db.prepare(
    `UPDATE receipts SET submitted = 1, actual_transaction_id = ?,
      submitted_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(transactionId, id);
}

export async function deleteReceipt(db: Db, id: number): Promise<boolean> {
  const receipt = getReceipt(db, id);
  if (!receipt) return false;
  await unlink(receipt.filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  db.prepare("DELETE FROM receipts WHERE id = ?").run(id);
  return true;
}
