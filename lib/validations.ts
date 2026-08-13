import type { Db } from "./db";
import type {
  ExtractedDocument,
  ValidationAppTransaction,
  ValidationDiff,
} from "./validation-types";
import { filterBlacklistedTransactions } from "./validation-blacklist";
import { compareValidationTransactions } from "./validation-diff";
import {
  applyStoredValidationMatches,
  type StoredValidationMatch,
} from "./validation-manual-matches";

export type ValidationTransactionRange = {
  accountId?: string | null;
  wallet: string;
  dateFrom: string;
  dateTo: string;
};

export type ValidationTransactionProvider = (
  range: ValidationTransactionRange,
) =>
  | readonly ValidationAppTransaction[]
  | Promise<readonly ValidationAppTransaction[]>;

export type ValidationTransactionSource =
  readonly ValidationAppTransaction[] | ValidationTransactionProvider;

const TRANSFER_TYPES = new Set([
  "transfer",
  "incoming transfer",
  "outgoing transfer",
]);

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function requireSqliteLedgerCompatibility() {
  if (process.env.SQLITE_LEDGER_COMPATIBILITY !== "1") {
    throw new Error(
      "SQLite transaction lookup is disabled. Supply live Actual Budget transactions instead.",
    );
  }
}

function calendarDate(value: string) {
  return value.slice(0, 10);
}

function compareStableIds(
  left: ValidationAppTransaction["id"],
  right: ValidationAppTransaction["id"],
) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  const compared = String(left).localeCompare(String(right));
  if (compared) return compared;
  if (typeof left === typeof right) return 0;
  return typeof left === "number" ? -1 : 1;
}

export function filterValidationTransactionsForRange(
  transactions: readonly ValidationAppTransaction[],
  range: ValidationTransactionRange,
): ValidationAppTransaction[] {
  return transactions
    .filter(
      (transaction) =>
        !transaction.startingBalance &&
        (range.accountId
          ? transaction.accountId === range.accountId
          : transaction.wallet === range.wallet) &&
        calendarDate(transaction.date) >= range.dateFrom &&
        calendarDate(transaction.date) <= range.dateTo &&
        !TRANSFER_TYPES.has(transaction.type.toLowerCase()),
    )
    .slice()
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        compareStableIds(left.id, right.id),
    );
}

async function resolveValidationTransactions(
  source: ValidationTransactionSource,
  range: ValidationTransactionRange,
) {
  const transactions =
    typeof source === "function" ? await source(range) : source;
  return filterValidationTransactionsForRange(transactions, range);
}

/**
 * Retained solely for legacy SQLite-ledger tests and migrations. Production
 * validation reconciliation must receive transactions from Actual Budget.
 */
export function getWalletValidationTransactions(
  db: Db,
  wallet: string,
  dateFrom: string,
  dateTo: string,
): ValidationAppTransaction[] {
  requireSqliteLedgerCompatibility();
  const exclusiveEnd = new Date(`${dateTo}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return db
    .prepare(
      `
    SELECT id, fingerprint, date, wallet, type, category_name AS categoryName, amount, currency, note
    FROM transactions
    WHERE deleted_at IS NULL AND wallet = ?
      AND LOWER(type) NOT IN ('transfer', 'incoming transfer', 'outgoing transfer')
      AND date >= ? AND date < ?
    ORDER BY date ASC, id ASC
  `,
    )
    .all(
      wallet,
      `${dateFrom}T00:00:00.000Z`,
      exclusiveEnd.toISOString(),
    ) as ValidationAppTransaction[];
}

export function createValidation(
  db: Db,
  input: {
    wallet: string;
    accountId?: string;
    filename: string;
    document: ExtractedDocument;
    rawOpenAI: unknown;
    dateFrom: string;
    dateTo: string;
    thumbnail: Buffer;
    diff: ValidationDiff;
    model: string;
  },
) {
  const result = db
    .prepare(
      `
    INSERT INTO validation_runs (
      wallet, account_id, source_filename, title, print_date, issuer, account_reference,
      metadata_json, date_from, date_to, thumbnail_png, extracted_json,
      raw_openai_json, diff_json, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      input.wallet,
      input.accountId ?? null,
      input.filename,
      input.document.title,
      input.document.printDate,
      input.document.issuer,
      input.document.accountReference,
      JSON.stringify(input.document.metadata),
      input.dateFrom,
      input.dateTo,
      input.thumbnail,
      JSON.stringify(input.document),
      JSON.stringify(input.rawOpenAI),
      JSON.stringify(input.diff),
      input.model,
    );
  const id = Number(result.lastInsertRowid);
  return process.env.SQLITE_LEDGER_COMPATIBILITY === "1"
    ? getValidation(db, id)
    : readStoredValidation(db, id);
}

export function enqueueValidation(
  db: Db,
  input: {
    wallet: string;
    accountId?: string;
    filename: string;
    pdf: Buffer;
  },
) {
  const emptyDiff: ValidationDiff = {
    matching: [],
    missingInApp: [],
    missingInDocument: [],
  };
  const result = db
    .prepare(
      `
    INSERT INTO validation_runs (
      wallet, account_id, source_filename, title, metadata_json, date_from, date_to,
      thumbnail_png, extracted_json, raw_openai_json, diff_json, model, status, pdf_blob
    ) VALUES (?, ?, ?, ?, '{}', '', '', X'', '{}', '{}', ?, '', 'processing', ?)
  `,
    )
    .run(
      input.wallet,
      input.accountId ?? null,
      input.filename,
      input.filename,
      JSON.stringify(emptyDiff),
      input.pdf,
    );
  return Number(result.lastInsertRowid);
}

export function completeValidation(
  db: Db,
  id: number,
  input: {
    document: ExtractedDocument;
    rawOpenAI: unknown;
    dateFrom: string;
    dateTo: string;
    thumbnail: Buffer;
    diff: ValidationDiff;
    model: string;
  },
) {
  db.prepare(
    `UPDATE validation_runs SET title = ?, print_date = ?, issuer = ?, account_reference = ?,
    metadata_json = ?, date_from = ?, date_to = ?, thumbnail_png = ?, extracted_json = ?,
    raw_openai_json = ?, diff_json = ?, model = ?, status = 'complete', error = NULL, pdf_blob = NULL
    WHERE id = ?`,
  ).run(
    input.document.title,
    input.document.printDate,
    input.document.issuer,
    input.document.accountReference,
    JSON.stringify(input.document.metadata),
    input.dateFrom,
    input.dateTo,
    input.thumbnail,
    JSON.stringify(input.document),
    JSON.stringify(input.rawOpenAI),
    JSON.stringify(input.diff),
    input.model,
    id,
  );
}

export function failValidation(db: Db, id: number, error: string) {
  db.prepare(
    "UPDATE validation_runs SET status = 'failed', error = ?, pdf_blob = NULL WHERE id = ?",
  ).run(error, id);
}

export function listValidations(db: Db) {
  const rows = db
    .prepare(
      `
    SELECT id, wallet, source_filename AS filename, title, print_date AS printDate,
      account_id AS accountId, issuer, account_reference AS accountReference, date_from AS dateFrom,
      date_to AS dateTo, diff_json AS diffJson, model, status, error, created_at AS createdAt
    FROM validation_runs ORDER BY created_at DESC, id DESC
  `,
    )
    .all() as Array<{
    id: number;
    wallet: string;
    accountId: string | null;
    filename: string;
    title: string;
    printDate: string | null;
    issuer: string | null;
    accountReference: string | null;
    dateFrom: string;
    dateTo: string;
    diffJson: string;
    model: string;
    status: string;
    error: string | null;
    createdAt: string;
  }>;
  return rows.map(({ diffJson, ...row }) => {
    const diff = parseJson<ValidationDiff>(diffJson);
    return {
      ...row,
      counts: {
        matching: diff.matching.length,
        missingInApp: diff.missingInApp.length,
        missingInDocument: diff.missingInDocument.length,
      },
    };
  });
}

type StoredValidationRow = {
  id: number;
  wallet: string;
  accountId: string | null;
  filename: string;
  title: string;
  printDate: string | null;
  issuer: string | null;
  accountReference: string | null;
  metadataJson: string;
  dateFrom: string;
  dateTo: string;
  extractedJson: string;
  rawOpenAIJson: string;
  diffJson: string;
  model: string;
  status: string;
  error: string | null;
  createdAt: string;
};

function readStoredValidation(db: Db, id: number) {
  const row = db
    .prepare(
      `
    SELECT id, wallet, account_id AS accountId, source_filename AS filename, title, print_date AS printDate,
      issuer, account_reference AS accountReference, metadata_json AS metadataJson,
      date_from AS dateFrom, date_to AS dateTo, extracted_json AS extractedJson,
      raw_openai_json AS rawOpenAIJson, diff_json AS diffJson, model, status, error,
      created_at AS createdAt
    FROM validation_runs WHERE id = ?
  `,
    )
    .get(id) as StoredValidationRow | undefined;
  if (!row) return null;
  const { metadataJson, extractedJson, rawOpenAIJson, diffJson, ...data } = row;
  const extracted = parseJson<ExtractedDocument>(extractedJson);
  return {
    ...data,
    metadata: parseJson<Record<string, string>>(metadataJson),
    extracted,
    rawOpenAI: parseJson<unknown>(rawOpenAIJson),
    diff: parseJson<ValidationDiff>(diffJson),
    suggestions: [] as ReturnType<
      typeof applyStoredValidationMatches
    >["suggestions"],
  };
}

export type ValidationDetails = NonNullable<
  ReturnType<typeof readStoredValidation>
>;

function getStoredValidationMatches(db: Db, id: number) {
  return db
    .prepare(
      `SELECT document_key AS documentKey, app_fingerprint AS appFingerprint
       FROM validation_manual_matches WHERE validation_id = ? ORDER BY id`,
    )
    .all(id) as StoredValidationMatch[];
}

function reconcileValidation(
  db: Db,
  validation: ValidationDetails,
  appTransactions: ValidationAppTransaction[],
  useLiveDiff = false,
) {
  if (validation.status !== "complete") return validation;
  const base = compareValidationTransactions(
    filterBlacklistedTransactions(db, validation.extracted.transactions),
    appTransactions,
  );
  const stored = getStoredValidationMatches(db, Number(validation.id));
  const applied = applyStoredValidationMatches(base, stored);
  return {
    ...validation,
    // Historical runs retain the exact persisted extraction diff. Once a user
    // creates a manual link, reconcile against current Actual transactions so
    // that stable fingerprints survive transaction replacement.
    diff: useLiveDiff || stored.length ? applied.diff : validation.diff,
    suggestions: applied.suggestions,
  };
}

async function getValidationFromSource(
  db: Db,
  id: number,
  source: ValidationTransactionSource,
) {
  const validation = readStoredValidation(db, id);
  if (!validation || validation.status !== "complete") return validation;
  const range = {
    accountId: validation.accountId,
    wallet: String(validation.wallet),
    dateFrom: String(validation.dateFrom),
    dateTo: String(validation.dateTo),
  };
  return reconcileValidation(
    db,
    validation,
    await resolveValidationTransactions(source, range),
  );
}

export async function recomputeValidationDiff(
  db: Db,
  id: number,
  source: ValidationTransactionSource,
) {
  const validation = readStoredValidation(db, id);
  if (!validation || validation.status !== "complete") return validation;
  const transactions = await resolveValidationTransactions(source, {
    accountId: validation.accountId,
    wallet: validation.wallet,
    dateFrom: validation.dateFrom,
    dateTo: validation.dateTo,
  });
  const reconciled = reconcileValidation(db, validation, transactions, true);
  updateValidationDiff(db, id, reconciled.diff);
  return reconciled;
}

function getValidationFromSqlite(db: Db, id: number) {
  requireSqliteLedgerCompatibility();
  const validation = readStoredValidation(db, id);
  if (!validation || validation.status !== "complete") return validation;
  return reconcileValidation(
    db,
    validation,
    getWalletValidationTransactions(
      db,
      String(validation.wallet),
      String(validation.dateFrom),
      String(validation.dateTo),
    ),
  );
}

export function getValidation(
  db: Db,
  id: number,
  source: ValidationTransactionSource,
): Promise<ValidationDetails | null>;
/** @deprecated SQLite-ledger compatibility only. */
export function getValidation(db: Db, id: number): ValidationDetails | null;
export function getValidation(
  db: Db,
  id: number,
  source?: ValidationTransactionSource,
) {
  return source === undefined
    ? getValidationFromSqlite(db, id)
    : getValidationFromSource(db, id, source);
}

export function getValidationThumbnail(db: Db, id: number) {
  const row = db
    .prepare(
      "SELECT thumbnail_png AS thumbnail FROM validation_runs WHERE id = ?",
    )
    .get(id) as { thumbnail: Buffer } | undefined;
  return row?.thumbnail ?? null;
}

export function updateValidationDiff(db: Db, id: number, diff: ValidationDiff) {
  db.prepare("UPDATE validation_runs SET diff_json = ? WHERE id = ?").run(
    JSON.stringify(diff),
    id,
  );
}

export function createValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
  appFingerprint: string,
  source: ValidationTransactionSource,
): Promise<ValidationDetails | null>;
/** @deprecated SQLite-ledger compatibility only. */
export function createValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
  appFingerprint: string,
): ValidationDetails | null;
export function createValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
  appFingerprint: string,
  source?: ValidationTransactionSource,
) {
  if (source === undefined) {
    requireSqliteLedgerCompatibility();
    const validation = getValidationFromSqlite(db, validationId);
    return persistValidationManualMatch(
      db,
      validationId,
      documentKey,
      appFingerprint,
      validation,
      () => getValidationFromSqlite(db, validationId),
    );
  }
  return createValidationManualMatchFromSource(
    db,
    validationId,
    documentKey,
    appFingerprint,
    source,
  );
}

function persistValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
  appFingerprint: string,
  validation: ValidationDetails | null,
  readUpdated: () => ValidationDetails | null,
) {
  const suggestion = validation?.suggestions.find(
    (item) =>
      item.documentKey === documentKey &&
      item.app.fingerprint === appFingerprint,
  );
  if (!suggestion)
    throw new Error("Suggested transaction is no longer available.");
  db.prepare(
    `INSERT INTO validation_manual_matches (validation_id, document_key, app_fingerprint)
     VALUES (?, ?, ?)
     ON CONFLICT(validation_id, document_key) DO UPDATE
     SET app_fingerprint = excluded.app_fingerprint, created_at = CURRENT_TIMESTAMP`,
  ).run(validationId, documentKey, appFingerprint);
  const updated = readUpdated();
  if (updated) updateValidationDiff(db, validationId, updated.diff);
  return updated;
}

async function createValidationManualMatchFromSource(
  db: Db,
  validationId: number,
  documentKey: string,
  appFingerprint: string,
  source: ValidationTransactionSource,
) {
  const storedValidation = readStoredValidation(db, validationId);
  if (!storedValidation || storedValidation.status !== "complete") {
    return storedValidation;
  }
  const transactions = await resolveValidationTransactions(source, {
    accountId: storedValidation.accountId,
    wallet: String(storedValidation.wallet),
    dateFrom: String(storedValidation.dateFrom),
    dateTo: String(storedValidation.dateTo),
  });
  const validation = reconcileValidation(db, storedValidation, transactions);
  return persistValidationManualMatch(
    db,
    validationId,
    documentKey,
    appFingerprint,
    validation,
    () => {
      const updated = readStoredValidation(db, validationId);
      return updated ? reconcileValidation(db, updated, transactions) : null;
    },
  );
}

export function deleteValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
  source: ValidationTransactionSource,
): Promise<ValidationDetails | null>;
/** @deprecated SQLite-ledger compatibility only. */
export function deleteValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
): ValidationDetails | null;
export function deleteValidationManualMatch(
  db: Db,
  validationId: number,
  documentKey: string,
  source?: ValidationTransactionSource,
) {
  if (source === undefined) {
    requireSqliteLedgerCompatibility();
    const current = getValidationFromSqlite(db, validationId);
    return deleteValidationManualMatchWithTransactions(
      db,
      validationId,
      documentKey,
      current,
      current
        ? getWalletValidationTransactions(
            db,
            String(current.wallet),
            String(current.dateFrom),
            String(current.dateTo),
          )
        : [],
    );
  }
  return deleteValidationManualMatchFromSource(
    db,
    validationId,
    documentKey,
    source,
  );
}

function deleteValidationManualMatchWithTransactions(
  db: Db,
  validationId: number,
  documentKey: string,
  current: ValidationDetails | null,
  transactions: ValidationAppTransaction[],
) {
  if (!current || current.status !== "complete") return null;
  const deleted = db
    .prepare(
      "DELETE FROM validation_manual_matches WHERE validation_id = ? AND document_key = ?",
    )
    .run(validationId, documentKey).changes;
  if (!deleted) return null;
  const base = compareValidationTransactions(
    filterBlacklistedTransactions(db, current.extracted.transactions),
    transactions,
  );
  const reconciled = reconcileValidation(
    db,
    { ...current, diff: base },
    transactions,
    true,
  );
  updateValidationDiff(db, validationId, reconciled.diff);
  return reconciled;
}

async function deleteValidationManualMatchFromSource(
  db: Db,
  validationId: number,
  documentKey: string,
  source: ValidationTransactionSource,
) {
  const current = readStoredValidation(db, validationId);
  if (!current || current.status !== "complete") return null;
  const transactions = await resolveValidationTransactions(source, {
    accountId: current.accountId,
    wallet: String(current.wallet),
    dateFrom: String(current.dateFrom),
    dateTo: String(current.dateTo),
  });
  return deleteValidationManualMatchWithTransactions(
    db,
    validationId,
    documentKey,
    reconcileValidation(db, current, transactions),
    transactions,
  );
}

export function deleteValidation(db: Db, id: number) {
  return db.transaction(() => {
    db.prepare(
      "DELETE FROM validation_manual_matches WHERE validation_id = ?",
    ).run(id);
    return (
      db.prepare("DELETE FROM validation_runs WHERE id = ?").run(id).changes > 0
    );
  })();
}
