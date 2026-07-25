import { readSheet } from "read-excel-file/node";
import { parse } from "csv-parse/sync";
import { transactionColumns, type TransactionInput } from "./types";

const asOptionalText = (value: unknown) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

function asDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const text = String(value ?? "").trim();
  const date = new Date(text);
  if (!text || Number.isNaN(date.valueOf())) throw new Error(`Invalid date "${text}"`);
  return date.toISOString();
}

function parseCells(cells: unknown[][]) {
  if (!cells.length) throw new Error("The file does not contain a readable transaction table.");
  const headers = new Set(cells[0].map((value) => String(value ?? "").trim()));
  const missing = transactionColumns.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  const indexes = Object.fromEntries(cells[0].map((value, index) => [String(value ?? "").trim(), index]));
  return cells.slice(1).filter((row) => row.some((value) => value != null)).map((row, index) => {
    const get = (column: typeof transactionColumns[number]) => row[indexes[column]];
    const amount = Number(get("Amount"));
    if (!Number.isFinite(amount)) throw new Error(`Row ${index + 2}: invalid amount`);
    const wallet = String(get("Wallet") ?? "").trim();
    const type = String(get("Type") ?? "").trim();
    const currency = String(get("Currency") ?? "").trim().toUpperCase();
    if (!wallet || !type || !currency) throw new Error(`Row ${index + 2}: wallet, type and currency are required`);
    const transaction: TransactionInput = {
      date: asDate(get("Date")),
      wallet,
      type,
      categoryName: asOptionalText(get("Category name")),
      amount,
      currency,
      note: asOptionalText(get("Note")),
      labels: asOptionalText(get("Labels")),
      author: asOptionalText(get("Author")),
    };
    const raw = Object.fromEntries(transactionColumns.map((column) => [column, get(column)]));
    return { transaction, sourceRow: index + 2, raw };
  });
}

export async function parseImportFile(buffer: Buffer, filename: string) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "xlsx") {
    return parseCells(await readSheet(buffer));
  }
  if (extension === "csv") {
    const cells = parse(buffer, {
      bom: true,
      delimiter: [",", ";", "\t"],
      relax_column_count: true,
      skip_empty_lines: true,
    }) as unknown[][];
    return parseCells(cells);
  }
  throw new Error("Only .xlsx and .csv files are supported.");
}

export async function parseWorkbook(buffer: Buffer) {
  return parseImportFile(buffer, "transactions.xlsx");
}
