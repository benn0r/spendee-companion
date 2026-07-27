import type { Db } from "./db";
import type { ExtractedDocument, ValidationAppTransaction, ValidationDiff } from "./validation-types";

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function getWalletValidationTransactions(db: Db, wallet: string, dateFrom: string, dateTo: string) {
  const exclusiveEnd = new Date(`${dateTo}T00:00:00.000Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return db.prepare(`
    SELECT id, date, wallet, type, category_name AS categoryName, amount, currency, note
    FROM transactions
    WHERE deleted_at IS NULL AND wallet = ? AND date >= ? AND date < ?
    ORDER BY date ASC, id ASC
  `).all(wallet, `${dateFrom}T00:00:00.000Z`, exclusiveEnd.toISOString()) as ValidationAppTransaction[];
}

export function createValidation(db: Db, input: {
  wallet: string;
  filename: string;
  document: ExtractedDocument;
  rawOpenAI: unknown;
  dateFrom: string;
  dateTo: string;
  thumbnail: Buffer;
  diff: ValidationDiff;
  model: string;
}) {
  const result = db.prepare(`
    INSERT INTO validation_runs (
      wallet, source_filename, title, print_date, issuer, account_reference,
      metadata_json, date_from, date_to, thumbnail_png, extracted_json,
      raw_openai_json, diff_json, model
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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

export function enqueueValidation(db: Db, input: { wallet: string; filename: string; pdf: Buffer }) {
  const emptyDiff: ValidationDiff = { matching: [], missingInApp: [], missingInDocument: [] };
  const result = db.prepare(`
    INSERT INTO validation_runs (
      wallet, source_filename, title, metadata_json, date_from, date_to,
      thumbnail_png, extracted_json, raw_openai_json, diff_json, model, status, pdf_blob
    ) VALUES (?, ?, ?, '{}', '', '', X'', '{}', '{}', ?, '', 'processing', ?)
  `).run(input.wallet, input.filename, input.filename, JSON.stringify(emptyDiff), input.pdf);
  return Number(result.lastInsertRowid);
}

export function completeValidation(db: Db, id: number, input: {
  document: ExtractedDocument; rawOpenAI: unknown; dateFrom: string; dateTo: string;
  thumbnail: Buffer; diff: ValidationDiff; model: string;
}) {
  db.prepare(`UPDATE validation_runs SET title = ?, print_date = ?, issuer = ?, account_reference = ?,
    metadata_json = ?, date_from = ?, date_to = ?, thumbnail_png = ?, extracted_json = ?,
    raw_openai_json = ?, diff_json = ?, model = ?, status = 'complete', error = NULL, pdf_blob = NULL
    WHERE id = ?`).run(input.document.title, input.document.printDate, input.document.issuer,
    input.document.accountReference, JSON.stringify(input.document.metadata), input.dateFrom, input.dateTo,
    input.thumbnail, JSON.stringify(input.document), JSON.stringify(input.rawOpenAI), JSON.stringify(input.diff),
    input.model, id);
}

export function failValidation(db: Db, id: number, error: string) {
  db.prepare("UPDATE validation_runs SET status = 'failed', error = ?, pdf_blob = NULL WHERE id = ?").run(error, id);
}

export function listValidations(db: Db) {
  const rows = db.prepare(`
    SELECT id, wallet, source_filename AS filename, title, print_date AS printDate,
      issuer, account_reference AS accountReference, date_from AS dateFrom,
      date_to AS dateTo, diff_json AS diffJson, model, status, error, created_at AS createdAt
    FROM validation_runs ORDER BY created_at DESC, id DESC
  `).all() as Array<Record<string, unknown> & { diffJson: string }>;
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
  const row = db.prepare(`
    SELECT id, wallet, source_filename AS filename, title, print_date AS printDate,
      issuer, account_reference AS accountReference, metadata_json AS metadataJson,
      date_from AS dateFrom, date_to AS dateTo, extracted_json AS extractedJson,
      raw_openai_json AS rawOpenAIJson, diff_json AS diffJson, model, status, error,
      created_at AS createdAt
    FROM validation_runs WHERE id = ?
  `).get(id) as (Record<string, unknown> & {
    metadataJson: string;
    extractedJson: string;
    rawOpenAIJson: string;
    diffJson: string;
  }) | undefined;
  if (!row) return null;
  const { metadataJson, extractedJson, rawOpenAIJson, diffJson, ...data } = row;
  return {
    ...data,
    metadata: parseJson<Record<string, string>>(metadataJson),
    extracted: parseJson<ExtractedDocument>(extractedJson),
    rawOpenAI: parseJson<unknown>(rawOpenAIJson),
    diff: parseJson<ValidationDiff>(diffJson),
  };
}

export function getValidationThumbnail(db: Db, id: number) {
  const row = db.prepare("SELECT thumbnail_png AS thumbnail FROM validation_runs WHERE id = ?")
    .get(id) as { thumbnail: Buffer } | undefined;
  return row?.thumbnail ?? null;
}
