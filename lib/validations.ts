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

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function getWalletValidationTransactions(
  db: Db,
  wallet: string,
  dateFrom: string,
  dateTo: string,
) {
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
      wallet, source_filename, title, print_date, issuer, account_reference,
      metadata_json, date_from, date_to, thumbnail_png, extracted_json,
      raw_openai_json, diff_json, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      input.wallet,
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
  return getValidation(db, Number(result.lastInsertRowid));
}

export function enqueueValidation(
  db: Db,
  input: { wallet: string; filename: string; pdf: Buffer },
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
      wallet, source_filename, title, metadata_json, date_from, date_to,
      thumbnail_png, extracted_json, raw_openai_json, diff_json, model, status, pdf_blob
    ) VALUES (?, ?, ?, '{}', '', '', X'', '{}', '{}', ?, '', 'processing', ?)
  `,
    )
    .run(
      input.wallet,
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
      issuer, account_reference AS accountReference, date_from AS dateFrom,
      date_to AS dateTo, diff_json AS diffJson, model, status, error, created_at AS createdAt
    FROM validation_runs ORDER BY created_at DESC, id DESC
  `,
    )
    .all() as Array<Record<string, unknown> & { diffJson: string }>;
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

export function getValidation(db: Db, id: number) {
  const row = db
    .prepare(
      `
    SELECT id, wallet, source_filename AS filename, title, print_date AS printDate,
      issuer, account_reference AS accountReference, metadata_json AS metadataJson,
      date_from AS dateFrom, date_to AS dateTo, extracted_json AS extractedJson,
      raw_openai_json AS rawOpenAIJson, diff_json AS diffJson, model, status, error,
      created_at AS createdAt
    FROM validation_runs WHERE id = ?
  `,
    )
    .get(id) as
    | (Record<string, unknown> & {
        metadataJson: string;
        extractedJson: string;
        rawOpenAIJson: string;
        diffJson: string;
      })
    | undefined;
  if (!row) return null;
  const { metadataJson, extractedJson, rawOpenAIJson, diffJson, ...data } = row;
  const extracted = parseJson<ExtractedDocument>(extractedJson);
  let diff = parseJson<ValidationDiff>(diffJson);
  let suggestions = [] as ReturnType<
    typeof applyStoredValidationMatches
  >["suggestions"];
  if (data.status === "complete") {
    const base = compareValidationTransactions(
      filterBlacklistedTransactions(db, extracted.transactions),
      getWalletValidationTransactions(
        db,
        String(data.wallet),
        String(data.dateFrom),
        String(data.dateTo),
      ),
    );
    const stored = db
      .prepare(
        `SELECT document_key AS documentKey, app_fingerprint AS appFingerprint
         FROM validation_manual_matches WHERE validation_id = ? ORDER BY id`,
      )
      .all(id) as StoredValidationMatch[];
    const applied = applyStoredValidationMatches(base, stored);
    suggestions = applied.suggestions;
    // Historical runs retain the exact persisted extraction diff. Once a user
    // creates a manual link, reconcile against current imports so that stable
    // fingerprints can carry that link across full wallet replacements.
    if (stored.length) diff = applied.diff;
  }
  return {
    ...data,
    metadata: parseJson<Record<string, string>>(metadataJson),
    extracted,
    rawOpenAI: parseJson<unknown>(rawOpenAIJson),
    diff,
    suggestions,
  };
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
) {
  const validation = getValidation(db, validationId);
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
  const updated = getValidation(db, validationId);
  if (updated) updateValidationDiff(db, validationId, updated.diff);
  return updated;
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
